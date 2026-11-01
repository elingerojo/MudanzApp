import type { AiDraftResult } from '@mudanzapp/shared';
import { Router } from 'express';
import { z } from 'zod';

import { canActOnEvent } from '../domain/account.js';
import { draftPhotoVariant } from '../domain/item.js';
import { AppError } from '../errors.js';
import { findEventForUser } from '../store/identity-store.js';
import { findPhotoForDraft } from '../store/item-store.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { createSessionMiddleware, identityOf, type RequestIdentity } from './session.js';

/**
 * Borrador de la ficha con IA (`ai-draft`, ciclo 3d).
 *
 * `POST /events/:eventId/items/:itemId/draft` **lee** y no escribe: el borrador no es estado, no hay
 * tabla, no hay historial, y publicar sigue siendo la acción explícita de 3c. Quien persiste es el
 * humano, con el `PATCH` de `items-router`, y solo lo que aprobó (`decisiones` §34).
 *
 * La ruta no tiene cuerpo: no recibe bytes, así que el backend tampoco los reenvía. Lo único que hace
 * es resolver la variante guardada, componer su dirección pública con el almacén y llamar a la
 * costura. El `200` —y no `201`— es la diferencia explícita con `POST /items`: no se crea recurso.
 *
 * La autorización se ejerce **antes** de cualquier lectura y con la misma regla que el resto del
 * evento (`canActOnEvent`): un evento ajeno responde `not_found` y no se distingue del inexistente
 * (`decisiones` §24).
 */
const itemParamsSchema = z.object({ eventId: z.uuid(), itemId: z.uuid() });

export function createAiRouter(deps: IdentityDeps): Router {
  const router = Router();
  const requireSession = createSessionMiddleware(deps.database);

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

  router.post('/events/:eventId/items/:itemId/draft', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId, itemId } = parseOrThrow(itemParamsSchema, request.params);
      const identity = identityOf(request);

      if (!(await canAct(identity, eventId))) {
        throw new AppError('not_found');
      }

      const photo = await findPhotoForDraft(deps.database, eventId, itemId);
      if (photo === null) {
        throw new AppError('item_not_found');
      }

      // Una foto anterior a 3c-optimizar no tiene variante y por tanto no tiene dirección pública que
      // el proveedor pueda descargar: es el mismo caso que no tener foto, no un fallo del proveedor.
      const variant = draftPhotoVariant(photo.variants);
      if (photo.photoId === null || variant === null) {
        throw new AppError('item_photo_missing');
      }

      const draft = await deps.ai.draft({
        imageUrl: deps.storage.publicUrl(variant.objectKey),
        mimeType: variant.contentType,
      });

      const payload: AiDraftResult = { draft };
      response.status(200).json(payload);
    };

    void handle().catch(next);
  });

  return router;
}
