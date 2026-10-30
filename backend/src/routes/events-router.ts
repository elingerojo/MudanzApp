import type { CreatedInvitation, CurrentIdentity, EventSummary } from '@mudanzapp/shared';
import { Router } from 'express';
import { z } from 'zod';

import { INVITATION_MAX_USES, canActOnEvent, invitationExpiry } from '../domain/account.js';
import { AppError } from '../errors.js';
import {
  createInvitation,
  findEventById,
  findEventForUser,
  findEventOwnerUserId,
  listEventsForUser,
} from '../store/identity-store.js';
import { createOpaqueToken, hashToken } from '../tokens.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { toEventSummary } from './presenters.js';
import { createSessionMiddleware, identityOf, type RequestIdentity } from './session.js';

const eventParamsSchema = z.object({ eventId: z.uuid() });

/**
 * Eventos de la sesión: lectura y emisión de invitaciones.
 *
 * El invitado ve su evento y **ningún otro**: un evento del que no es miembro responde `not_found`
 * y no se distingue del inexistente. La autorización se ejerce en la lectura, no en la URL
 * (`decisiones` §24). Una sesión de evento ve exactamente el evento que la originó y puede emitir
 * invitaciones para él (`§30`).
 */
export function createEventsRouter(deps: IdentityDeps): Router {
  const router = Router();
  // Por ruta, no `router.use`: un middleware de router sin camino interceptaría también `/admin/*`
  // y `/auth/*`, que se montan antes y después con su propia credencial.
  const requireSession = createSessionMiddleware(deps.database);

  /**
   * Eventos visibles para la sesión: la membresía manda en una de cuenta y el propio evento en una
   * de evento. Es el único lugar donde se decide esa diferencia.
   */
  const visibleEvents = async (identity: RequestIdentity): Promise<EventSummary[]> => {
    if (identity.user !== null) {
      const events = await listEventsForUser(deps.database, identity.user.id);
      return events.map(toEventSummary);
    }

    if (identity.eventId === null) {
      return [];
    }

    const event = await findEventById(deps.database, identity.eventId);
    return event === null ? [] : [toEventSummary({ ...event, role: null })];
  };

  router.get('/auth/session', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const identity = identityOf(request);
      const payload: CurrentIdentity = {
        user: identity.user,
        session: { id: identity.sessionId, scope: identity.scope },
        events: await visibleEvents(identity),
      };
      response.json(payload);
    };

    void handle().catch(next);
  });

  router.get('/events', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const identity = identityOf(request);
      const events = await visibleEvents(identity);
      response.json({ events });
    };

    void handle().catch(next);
  });

  router.get('/events/:eventId', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const identity = identityOf(request);

      if (identity.user === null) {
        // Sesión de evento: solo el evento que la originó, y sin rol porque no hay membresía.
        if (identity.eventId !== eventId) {
          throw new AppError('not_found');
        }

        const event = await findEventById(deps.database, eventId);
        if (event === null) {
          throw new AppError('not_found');
        }

        response.json({ event: toEventSummary({ ...event, role: null }) });
        return;
      }

      const event = await findEventForUser(deps.database, eventId, identity.user.id);
      if (event === null) {
        throw new AppError('not_found');
      }

      response.json({ event: toEventSummary(event) });
    };

    void handle().catch(next);
  });

  /**
   * Invitación emitida por una sesión del evento, no solo por el administrador (`decisiones` §30):
   * cualquier co-dispositivo invita a otro dentro de su evento, sin cota por evento. Cada invitación
   * conserva sus términos de 72 horas y cinco canjes.
   */
  router.post('/events/:eventId/invitations', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const identity = identityOf(request);

      const ownerUserId = await findEventOwnerUserId(deps.database, eventId);
      if (ownerUserId === null) {
        throw new AppError('not_found');
      }

      const isMember =
        identity.user === null
          ? false
          : (await findEventForUser(deps.database, eventId, identity.user.id)) !== null;

      if (
        !canActOnEvent(
          { eventId: identity.eventId, userId: identity.user?.id ?? null },
          eventId,
          isMember,
        )
      ) {
        throw new AppError('not_found');
      }

      const token = createOpaqueToken();
      const invitation = await createInvitation(deps.database, {
        eventId,
        tokenHash: hashToken(token),
        createdBy: identity.user?.id ?? ownerUserId,
        expiresAt: invitationExpiry(deps.now()),
      });

      const payload: CreatedInvitation = {
        id: invitation.id,
        token,
        expiresAt: invitation.expiresAt.toISOString(),
        maxUses: INVITATION_MAX_USES,
      };
      response.status(201).json(payload);
    };

    void handle().catch(next);
  });

  return router;
}
