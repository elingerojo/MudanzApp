import {
  AI_DRAFT_LIMITS,
  PHOTO_BUNDLE_CONTENT_TYPE,
  PhotoBundleError,
  decodePhotoBundle,
  type AiDraftResult,
} from '@mudanzapp/shared';
import { Router } from 'express';
import { z } from 'zod';

import { canActOnEvent } from '../domain/account.js';
import { photoVariantContentType } from '../domain/item.js';
import { AppError } from '../errors.js';
import { findEventForUser } from '../store/identity-store.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { declaredContentType, readPhotoBody } from './raw-body.js';
import { createSessionMiddleware, identityOf, type RequestIdentity } from './session.js';

/**
 * Borrador de la ficha con IA (`ai-draft`, ciclo 3d; multifoto desde 3i).
 *
 * `POST /events/:eventId/ai/drafts` **lee** y no escribe: el borrador no es estado, no hay tabla, no
 * hay historial, y publicar sigue siendo la acción explícita de 3c. Quien persiste es el humano, con
 * el alta de `items-router` y su publicación (`decisiones` §34).
 *
 * La ruta **no conoce ningún artículo**: recibe **hasta N fotos en orden** —el bundle que el
 * dispositivo ya codificó, en el orden de la captura—, lo decodifica, lo pasa a la costura y devuelve
 * el borrador validado. El nivel de onboarding no se consulta aquí: el tope del nivel es una regla de
 * la captura y el borde solo aplica el tope duro de `AI_DRAFT_LIMITS.photos` (`plan-ciclo-3i` §0).
 *
 * Por eso no hay `itemId`, ni lectura de la base, ni `ObjectStore`, ni URL pública: el almacén no
 * participa en el borrador (`plan-ciclo-3d` §4). El `200` —y no `201`— es la diferencia explícita con
 * `POST /items`: no se crea recurso.
 *
 * La autorización se ejerce **antes** de leer el cuerpo y con la misma regla que el resto del evento
 * (`canActOnEvent`): un evento ajeno responde `not_found` y no se distingue del inexistente
 * (`decisiones` §24). Así un `401` o un `404` no cuestan bytes de subida ni una llamada al proveedor.
 */
const eventParamsSchema = z.object({ eventId: z.uuid() });

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

  router.post('/events/:eventId/ai/drafts', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const identity = identityOf(request);

      if (!(await canAct(identity, eventId))) {
        throw new AppError('not_found');
      }

      // El cuerpo ya no es una imagen: es el sobre que agrupa las fotos. Un tipo distinto es un
      // cliente que no habla este contrato, y el cliente ya sabe explicar este código.
      if (declaredContentType(request) !== PHOTO_BUNDLE_CONTENT_TYPE) {
        throw new AppError('photo_invalid');
      }

      const body = await readPhotoBody(request, AI_DRAFT_LIMITS.bundleBytes);
      const photos = decodeOrThrow(body).map((photo) => {
        // La frontera vuelve a aplicar la regla del dominio: un tipo que el almacén no admite no es
        // una foto del corte, aunque el sobre lo haya declarado (`plan-ciclo-3c-optimizar` §5).
        const contentType = photoVariantContentType(photo.contentType);
        if (contentType === null) {
          throw new AppError('photo_invalid');
        }

        return {
          bytes: Buffer.from(photo.bytes.buffer, photo.bytes.byteOffset, photo.bytes.byteLength),
          contentType,
        };
      });

      const draft = await deps.ai.draft({ photos });

      const payload: AiDraftResult = { draft };
      response.status(200).json(payload);
    };

    void handle().catch(next);
  });

  return router;
}

/**
 * Traduce el fallo del framing a los dos códigos del catálogo: una cabecera rota o una longitud que
 * no cuadra es `validation_failed`; una foto que no pasa el tope o el tipo es `photo_invalid`. Un
 * error que no es del framing sube tal cual: no se disfraza de nada.
 */
function decodeOrThrow(body: Uint8Array) {
  try {
    return decodePhotoBundle(body);
  } catch (error: unknown) {
    if (error instanceof PhotoBundleError && error.code === 'bundle_malformed') {
      throw new AppError('validation_failed');
    }

    if (error instanceof PhotoBundleError) {
      throw new AppError('photo_invalid');
    }

    throw error;
  }
}
