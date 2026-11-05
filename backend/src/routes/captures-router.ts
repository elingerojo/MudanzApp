import {
  CAPTURE_LIMITS,
  ITEM_PHOTO_VARIANTS,
  captureObjectKey,
  captureTicketRequestSchema,
  type CaptureTicket,
  type CaptureUploadUrl,
  type ItemPhotoVariant,
} from '@mudanzapp/shared';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { canActOnEvent } from '../domain/account.js';
import { AppError } from '../errors.js';
import { findEventForUser } from '../store/identity-store.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { createSessionMiddleware, identityOf, type RequestIdentity } from './session.js';

/**
 * Ticket de captura y descarte del staging (ciclo 4g, `direct-upload`).
 *
 * El ticket **no recibe bytes y no escribe nada**: firma una escritura por variante y devuelve la
 * clave que el servidor volverá a derivar al adjuntar, de modo que el cliente no transporta claves.
 * El navegador sube `thumb`, `medium` y `large` directo al almacén; la adjunción, que sí verifica con
 * `HEAD`, vive en `items-router` porque es un acto sobre el artículo.
 *
 * `DELETE` es la otra mitad de la regla «nada se escribe antes de decidir»: lo que el humano
 * descarta se borra en el acto, sin pedirle nada y sin poder fallar visiblemente.
 */

const eventParamsSchema = z.object({ eventId: z.uuid() });
const captureParamsSchema = z.object({ eventId: z.uuid(), captureId: z.uuid() });

export function createCapturesRouter(deps: IdentityDeps): Router {
  const router = Router();
  const requireSession = createSessionMiddleware(deps.database);

  /** La misma regla que el resto del evento: una sesión de evento llega solo a su evento. */
  const canAct = async (identity: RequestIdentity, eventId: string): Promise<boolean> => {
    const isMember =
      identity.user === null
        ? false
        : (await findEventForUser(deps.database, eventId, identity.user.id)) !== null;

    return canActOnEvent(
      { eventId: identity.eventId, userId: identity.user?.id ?? null },
      eventId,
      isMember,
    );
  };

  const presign = async (
    eventId: string,
    captureId: string,
    contentType: string,
    variant: ItemPhotoVariant,
  ): Promise<CaptureUploadUrl> => {
    const key = captureObjectKey(eventId, captureId, variant);

    return { key, url: await deps.storage.presignPut(key, contentType, CAPTURE_LIMITS.ttlSeconds) };
  };

  router.post('/events/:eventId/captures', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const identity = identityOf(request);

      if (!(await canAct(identity, eventId))) {
        throw new AppError('not_found');
      }

      const { contentType } = parseOrThrow(captureTicketRequestSchema, request.body);
      const captureId = randomUUID();

      // Las tres firmas se piden a la vez: son tres operaciones del mismo tipo y el cliente no debe
      // pagar tres viajes de ida y vuelta para empezar a subir.
      const [thumb, medium, large] = await Promise.all([
        presign(eventId, captureId, contentType, 'thumb'),
        presign(eventId, captureId, contentType, 'medium'),
        presign(eventId, captureId, contentType, 'large'),
      ]);

      const payload: CaptureTicket = {
        captureId,
        expiresAt: new Date(deps.now().getTime() + CAPTURE_LIMITS.ttlSeconds * 1_000).toISOString(),
        contentType,
        uploads: { thumb, medium, large },
      };

      response.status(201).json(payload);
    };

    void handle().catch(next);
  });

  /**
   * Descarta una captura: borra sus tres variantes del staging.
   *
   * Es idempotente y no distingue «no está» de «ya no está»: el cliente lo llama al reemplazar la
   * foto, al cerrar el formulario y cuando el envío falla, y su fallo nunca se le muestra. Un
   * `captureId` de otro evento no encuentra nada bajo este prefijo y también responde `204`; lo que
   * sí se rechaza es un evento del que la sesión no puede disponer.
   */
  router.delete(
    '/events/:eventId/captures/:captureId',
    requireSession,
    (request, response, next) => {
      const handle = async (): Promise<void> => {
        const { eventId, captureId } = parseOrThrow(captureParamsSchema, request.params);
        const identity = identityOf(request);

        if (!(await canAct(identity, eventId))) {
          throw new AppError('capture_not_found');
        }

        await Promise.all(
          ITEM_PHOTO_VARIANTS.map((variant) =>
            deps.storage.delete(captureObjectKey(eventId, captureId, variant)),
          ),
        );

        response.status(204).end();
      };

      void handle().catch(next);
    },
  );

  return router;
}
