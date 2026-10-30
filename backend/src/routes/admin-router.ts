import { createEventSchema, type CreatedInvitation } from '@mudanzapp/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { INVITATION_MAX_USES, invitationExpiry } from '../domain/account.js';
import { AppError } from '../errors.js';
import {
  createEvent,
  createInvitation,
  ensureAdminUser,
  findEventById,
  listEventSessions,
  revokeSession,
} from '../store/identity-store.js';
import { bearerToken, constantTimeEquals, createOpaqueToken, hashToken } from '../tokens.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { toEventSummary, toSessionSummary } from './presenters.js';

const eventParamsSchema = z.object({ eventId: z.uuid() });
const sessionParamsSchema = z.object({ sessionId: z.uuid() });

/**
 * Operaciones del administrador único: crear el evento, emitir la invitación y revocar sesiones.
 *
 * La credencial es `ADMIN_TOKEN`, el nombre reservado que se activa con la capacidad de
 * administración (`stack` §6 y manual `Man-3.4`). Se compara en tiempo constante y nunca se
 * imprime. Sin la variable, la capacidad responde un código estable en vez de degradar.
 */
export function createAdminRouter(deps: IdentityDeps): Router {
  const router = Router();

  const requireAdmin: RequestHandler = (request, _response, next) => {
    if (deps.adminToken === null) {
      next(new AppError('admin_not_configured'));
      return;
    }

    const token = bearerToken(request.headers.authorization);
    if (token === null || !constantTimeEquals(token, deps.adminToken)) {
      next(new AppError('admin_unauthorized'));
      return;
    }

    next();
  };

  router.use(requireAdmin);

  router.post('/events', (request, response, next) => {
    const handle = async (): Promise<void> => {
      const input = parseOrThrow(createEventSchema, request.body);
      const admin = await ensureAdminUser(deps.database);
      if (admin === null) {
        throw new AppError('internal_error');
      }

      const event = await createEvent(deps.database, {
        ownerUserId: admin.id,
        originCity: input.originCity,
        destinationCity: input.destinationCity,
        currency: input.currency,
      });

      response.status(201).json({ event: toEventSummary({ ...event, role: 'owner' }) });
    };

    void handle().catch(next);
  });

  router.post('/events/:eventId/invitations', (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const admin = await ensureAdminUser(deps.database);
      if (admin === null) {
        throw new AppError('internal_error');
      }

      const event = await findEventById(deps.database, eventId);
      if (event === null) {
        throw new AppError('not_found');
      }

      const token = createOpaqueToken();
      const invitation = await createInvitation(deps.database, {
        eventId: event.id,
        tokenHash: hashToken(token),
        createdBy: admin.id,
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

  router.get('/events/:eventId/sessions', (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const event = await findEventById(deps.database, eventId);
      if (event === null) {
        throw new AppError('not_found');
      }

      const sessions = await listEventSessions(deps.database, event.id);
      response.json({ sessions: sessions.map(toSessionSummary) });
    };

    void handle().catch(next);
  });

  router.delete('/sessions/:sessionId', (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { sessionId } = parseOrThrow(sessionParamsSchema, request.params);
      const revoked = await revokeSession(deps.database, sessionId);
      if (!revoked) {
        throw new AppError('not_found');
      }

      response.status(204).end();
    };

    void handle().catch(next);
  });

  return router;
}
