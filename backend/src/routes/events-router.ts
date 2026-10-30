import type { CurrentIdentity, EventSummary } from '@mudanzapp/shared';
import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../errors.js';
import { findEventForUser, listEventsForUser } from '../store/identity-store.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { toEventSummary } from './presenters.js';
import { createSessionMiddleware, identityOf } from './session.js';

const eventParamsSchema = z.object({ eventId: z.uuid() });

/**
 * Lectura autenticada por sesión.
 *
 * El invitado ve su evento y **ningún otro**: un evento del que no es miembro responde `not_found`
 * y no se distingue del inexistente. La autorización se ejerce en la lectura, no en la URL
 * (`decisiones` §24).
 */
export function createEventsRouter(deps: IdentityDeps): Router {
  const router = Router();
  // Por ruta, no `router.use`: un middleware de router sin camino interceptaría también `/admin/*`
  // y `/auth/*`, que se montan antes y después con su propia credencial.
  const requireSession = createSessionMiddleware(deps.database);

  router.get('/auth/session', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const identity = identityOf(request);
      const events = await listEventsForUser(deps.database, identity.user.id);
      const payload: CurrentIdentity = {
        user: identity.user,
        session: { id: identity.sessionId, scope: identity.scope },
        events: events.map(toEventSummary),
      };
      response.json(payload);
    };

    void handle().catch(next);
  });

  router.get('/events', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const identity = identityOf(request);
      const events = await listEventsForUser(deps.database, identity.user.id);
      response.json({ events: events.map(toEventSummary) });
    };

    void handle().catch(next);
  });

  router.get('/events/:eventId', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const identity = identityOf(request);
      const event = await findEventForUser(deps.database, eventId, identity.user.id);
      if (event === null) {
        throw new AppError('not_found');
      }

      const payload: { event: EventSummary } = { event: toEventSummary(event) };
      response.json(payload);
    };

    void handle().catch(next);
  });

  return router;
}
