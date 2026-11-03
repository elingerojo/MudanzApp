import type {
  CreatedInvitation,
  CurrentIdentity,
  EventDashboard,
  EventSummary,
} from '@mudanzapp/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  INVITATION_MAX_USES,
  canActOnEvent,
  canAdministerEvent,
  invitationExpiry,
  isCoDeviceSession,
} from '../domain/account.js';
import { AppError } from '../errors.js';
import {
  createInvitation,
  findEventById,
  findEventForUser,
  findEventOwnerUserId,
  findSessionById,
  listEventCoDeviceSessions,
  listEventsForUser,
  readEventAdministrator,
  revokeEventCoDeviceSession,
  type EventAdministratorRecord,
} from '../store/identity-store.js';
import { createOpaqueToken, hashToken } from '../tokens.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { toEventSummary, toSessionSummary } from './presenters.js';
import { createSessionMiddleware, identityOf, type RequestIdentity } from './session.js';

const eventParamsSchema = z.object({ eventId: z.uuid() });
const sessionParamsSchema = z.object({ eventId: z.uuid(), sessionId: z.uuid() });

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

  /**
   * La frontera de administración, en el único lugar donde se decide (ciclo 4c-2, decisión §37).
   *
   * El orden no se invierte: primero se resuelve si la sesión **alcanza** el evento —una sesión ajena o
   * inexistente responde `not_found`— y solo después si su sujeto lo **administra** —un miembro o un
   * co-dispositivo responde `forbidden`—. La diferencia importa: su evento ya es visible para un
   * co-dispositivo, así que negarlo con `not_found` sería mentirle y borraría la evidencia del rechazo.
   *
   * Vive aquí y no en cada ruta porque las dos —la lectura del panel y la des-invitación— ejercen el
   * mismo derecho: duplicarlo sería dos implementaciones de una sola regla.
   */
  const requireAdministrator = async (
    identity: RequestIdentity,
    eventId: string,
  ): Promise<EventAdministratorRecord> => {
    const administrator = await readEventAdministrator(deps.database, eventId);
    if (administrator === null) {
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

    if (
      !canAdministerEvent(
        { userId: identity.user?.id ?? null, isAdmin: identity.user?.isAdmin ?? false },
        administrator.adminUserId,
      )
    ) {
      throw new AppError('forbidden');
    }

    return administrator;
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
   * El panel del event-administrator (ciclo 4c-2): **una** lectura que autoriza y pinta.
   *
   * Publica quién administra —`null` mientras nadie reclama— y los co-dispositivos del evento. Los
   * contadores de capturas no viajan aquí: la sección ya los tiene en su propia lectura de artículos y
   * duplicarlos sería una segunda fuente del mismo hecho.
   */
  router.get('/events/:eventId/dashboard', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const identity = identityOf(request);

      const administrator = await requireAdministrator(identity, eventId);
      const devices = await listEventCoDeviceSessions(deps.database, eventId);

      const payload: EventDashboard = {
        administrator:
          administrator.adminUserId === null || administrator.displayName === null
            ? null
            : {
                id: administrator.adminUserId,
                displayName: administrator.displayName,
                isAdmin: administrator.isAdmin === true,
              },
        devices: devices.map(toSessionSummary),
      };
      response.json(payload);
    };

    void handle().catch(next);
  });

  /**
   * Des-invita un co-dispositivo del evento (ciclo 4c-2): el rey que lee el panel le retira el acceso.
   *
   * El rey es intocable por dos caminos independientes: su sesión es de cuenta y no aparece en la lista,
   * y este acto rechaza explícitamente su propia sesión. Ninguno de los dos depende del otro.
   *
   * Es idempotente: repetir el acto responde `204` y no reescribe el instante de la revocación.
   */
  router.delete(
    '/events/:eventId/sessions/:sessionId',
    requireSession,
    (request, response, next) => {
      const handle = async (): Promise<void> => {
        const { eventId, sessionId } = parseOrThrow(sessionParamsSchema, request.params);
        const identity = identityOf(request);

        // La propia sesión primero: la regla no depende del filtro de la lista ni de si el id existe.
        if (sessionId === identity.sessionId) {
          throw new AppError('forbidden');
        }

        await requireAdministrator(identity, eventId);

        const target = await findSessionById(deps.database, sessionId);
        if (target === null || target.eventId !== eventId) {
          // Sesión inexistente o de otro evento: desde aquí no se distingue de una que no existe.
          throw new AppError('not_found');
        }

        if (!isCoDeviceSession(target)) {
          // Una cuenta no se retira por esta puerta: su retiro es un acto de membresía (§37).
          throw new AppError('forbidden');
        }

        await revokeEventCoDeviceSession(deps.database, { eventId, sessionId });
        response.status(204).end();
      };

      void handle().catch(next);
    },
  );

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
