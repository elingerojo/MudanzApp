import type { AiDraftResult } from '@mudanzapp/shared';
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
 * Borrador de la ficha con IA (`ai-draft`, ciclo 3d).
 *
 * `POST /events/:eventId/ai/drafts` **lee** y no escribe: el borrador no es estado, no hay tabla, no
 * hay historial, y publicar sigue siendo la acción explícita de 3c. Quien persiste es el humano, con
 * el alta de `items-router` y su publicación (`decisiones` §34).
 *
 * La ruta **no conoce ningún artículo**: recibe la variante `medium` que el dispositivo ya codificó
 * como cuerpo binario crudo, la pasa a la costura y devuelve el borrador validado. Por eso no hay
 * `itemId`, ni lectura de la base, ni `ObjectStore`, ni URL pública: el almacén no participa en el
 * borrador (`plan-ciclo-3d` §4). El `200` —y no `201`— es la diferencia explícita con `POST /items`:
 * no se crea recurso.
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

      // Solo la salida del codificador del dispositivo: un tipo que el almacén no admite no es una
      // foto del corte, y el cliente ya sabe explicar este código (`plan-ciclo-3c-optimizar` §5).
      const contentType = photoVariantContentType(declaredContentType(request));
      if (contentType === null) {
        throw new AppError('photo_invalid');
      }

      const bytes = await readPhotoBody(request);
      if (bytes.length === 0) {
        throw new AppError('photo_invalid');
      }

      const draft = await deps.ai.draft({ bytes, contentType });

      const payload: AiDraftResult = { draft };
      response.status(200).json(payload);
    };

    void handle().catch(next);
  });

  return router;
}
