import {
  eventContactSchema,
  onboardingLevelFor,
  onboardingLevelSchema,
  parseContactPhone,
  type CartRequestSummary,
  type CreatedInvitation,
  type CurrentIdentity,
  type EventContact,
  type EventDashboard,
  type EventSummary,
  type OnboardingLevelResponse,
} from '@mudanzapp/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  INVITATION_MAX_USES,
  canActOnEvent,
  invitationExpiry,
  isCoDeviceSession,
} from '../domain/account.js';
import { AppError } from '../errors.js';
import { dismissCartRequest, listCartRequestsForEvent } from '../store/cart-store.js';
import {
  cancelInvitation,
  findEventById,
  findEventForUser,
  findEventOwnerUserId,
  findSessionById,
  issueInvitation,
  listEventCoDeviceSessions,
  listEventInvitations,
  listEventsForUser,
  readEventContact,
  revokeEventCoDeviceSession,
  updateEventContact,
  updateEventOnboardingLevel,
} from '../store/identity-store.js';
import { createOpaqueToken, hashToken } from '../tokens.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { requireEventAdministrator } from './event-administration.js';
import {
  toCartRequestSummary,
  toEventSummary,
  toInvitationSummary,
  toSessionSummary,
} from './presenters.js';
import { createSessionMiddleware, identityOf, type RequestIdentity } from './session.js';

const eventParamsSchema = z.object({ eventId: z.uuid() });
const sessionParamsSchema = z.object({ eventId: z.uuid(), sessionId: z.uuid() });
const invitationParamsSchema = z.object({ eventId: z.uuid(), invitationId: z.uuid() });
const cartRequestParamsSchema = z.object({ eventId: z.uuid(), requestId: z.uuid() });

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
   * El panel del event-administrator (ciclos 4c-2 y 4c-3): **una** lectura que autoriza y pinta.
   *
   * Publica quién administra —`null` mientras nadie reclama—, los co-dispositivos del evento y los
   * enlaces que emitió. Los contadores de capturas no viajan aquí: la sección ya los tiene en su propia
   * lectura de artículos y duplicarlos sería una segunda fuente del mismo hecho.
   */
  router.get('/events/:eventId/dashboard', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const identity = identityOf(request);

      const administrator = await requireEventAdministrator(deps.database, identity, eventId);
      const devices = await listEventCoDeviceSessions(deps.database, eventId);
      const invitations = await listEventInvitations(deps.database, eventId);

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
        invitations: invitations.map(toInvitationSummary),
      };
      response.json(payload);
    };

    void handle().catch(next);
  });

  /**
   * El WhatsApp del evento (ciclo 4e). Lo lee y lo escribe **solo** su administrador: la columna es
   * del vendedor, no del visitante, y el comprador nunca la conoce —recibe el enlace ya compuesto—.
   *
   * `contactPhone` nulo es «sin configurar», que es lo que deshabilita `Pídelos por WhatsApp` en la
   * tienda. Lo guardado es siempre dígitos: `parseContactPhone` decide la forma y un número inválido
   * responde `validation_failed` en vez de guardarse.
   */
  router.get('/events/:eventId/contact', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const identity = identityOf(request);

      await requireEventAdministrator(deps.database, identity, eventId);

      const contact = await readEventContact(deps.database, eventId);
      if (contact === null) {
        throw new AppError('not_found');
      }

      const payload: EventContact = { contactPhone: contact.contactPhone };
      response.json(payload);
    };

    void handle().catch(next);
  });

  /** Escribe el WhatsApp del evento; `null` lo quita. El acto no toca nada más del evento. */
  router.patch('/events/:eventId/contact', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const identity = identityOf(request);
      const input = parseOrThrow(eventContactSchema, request.body);

      await requireEventAdministrator(deps.database, identity, eventId);

      const parsed = parseContactPhone(input.contactPhone);
      if (!parsed.ok) {
        throw new AppError('validation_failed');
      }

      const updated = await updateEventContact(deps.database, {
        eventId,
        contactPhone: parsed.value,
      });
      if (updated === null) {
        throw new AppError('not_found');
      }

      const payload: EventContact = { contactPhone: updated.contactPhone };
      response.json(payload);
    };

    void handle().catch(next);
  });

  /**
   * Sube el nivel de onboarding del evento (corte 3k).
   *
   * No es un permiso: cualquier sesión del evento puede promoverlo, igual que puede invitar un
   * dispositivo (`decisiones` §30). Si una revisión `live` muestra que un co-dispositivo molesta al
   * dueño, el corte siguiente lo restringe a `requireEventAdministrator` sin cambiar el contrato.
   *
   * La respuesta publica el **efectivo** —`max(derivado, piso)`— y no el piso guardado: es lo único
   * que las superficies necesitan y evita que dos clientes calculen distinto. Escribir un valor menor
   * que el derivado no es un error; la UI solo ofrece subir.
   */
  router.patch('/events/:eventId/onboarding-level', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const identity = identityOf(request);
      const input = parseOrThrow(onboardingLevelSchema, request.body);

      // El alcance se pregunta antes del acto: un evento que la sesión no alcanza responde `not_found`
      // y no se distingue de uno que no existe.
      const reachable =
        identity.user === null
          ? identity.eventId === eventId
          : (await findEventForUser(deps.database, eventId, identity.user.id)) !== null;
      if (!reachable) {
        throw new AppError('not_found');
      }

      const updated = await updateEventOnboardingLevel(deps.database, {
        eventId,
        level: input.level,
      });
      if (updated === null) {
        throw new AppError('not_found');
      }

      const payload: OnboardingLevelResponse = {
        level: onboardingLevelFor(
          { publishedCount: updated.publishedCount },
          updated.onboardingLevel,
        ),
      };
      response.json(payload);
    };

    void handle().catch(next);
  });

  /**
   * Las solicitudes de carrito del evento (ciclo 4e): quién pidió qué, con la instantánea del momento
   * de pedir. Incluye atendidas y canceladas —su estado es la evidencia del acto, igual que los enlaces
   * de 4c-3— y no publica el `cart_id` ni el sujeto de la sesión del comprador.
   */
  router.get('/events/:eventId/cart-requests', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);

      await requireEventAdministrator(deps.database, identityOf(request), eventId);

      const requests = await listCartRequestsForEvent(deps.database, eventId);
      const payload: { readonly requests: readonly CartRequestSummary[] } = {
        requests: requests.map(toCartRequestSummary),
      };

      response.set('Cache-Control', 'private, no-store').json(payload);
    };

    void handle().catch(next);
  });

  /**
   * Descarta una solicitud (ciclo 4e): el vendedor ya atendió la conversación. Conserva el primer
   * instante y su autor, así que reintentar no reescribe la evidencia. Una solicitud de otro evento, o
   * una que el comprador canceló, no están para atender y responden `not_found`.
   */
  router.delete(
    '/events/:eventId/cart-requests/:requestId',
    requireSession,
    (request, response, next) => {
      const handle = async (): Promise<void> => {
        const { eventId, requestId } = parseOrThrow(cartRequestParamsSchema, request.params);
        const identity = identityOf(request);

        await requireEventAdministrator(deps.database, identity, eventId);

        const administrator = identity.user;
        if (administrator === null) {
          // `requireEventAdministrator` ya lo garantizó: una sesión de evento no administra.
          throw new AppError('forbidden');
        }

        const dismissed = await dismissCartRequest(deps.database, {
          eventId,
          requestId,
          dismissedBy: administrator.id,
          now: deps.now(),
        });
        if (!dismissed) {
          throw new AppError('not_found');
        }

        response.status(204).end();
      };

      void handle().catch(next);
    },
  );

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

        await requireEventAdministrator(deps.database, identity, eventId);

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
   * Cancela un enlace del evento (ciclo 4c-3): el rey que lee el panel impide que ese enlace admita
   * más canjes.
   *
   * La autorización va **antes** del acto, igual que en la des-invitación: un evento que la sesión no
   * alcanza responde `not_found` y un sujeto que no lo administra responde `forbidden`, sin distinguir
   * si la invitación existe. Después, una fila que no es de este evento —o que no existe— responde
   * `not_found`: la condición de la sentencia es el alcance del acto.
   *
   * Es idempotente: repetir responde `204` y no reescribe el instante de la cancelación.
   */
  router.delete(
    '/events/:eventId/invitations/:invitationId',
    requireSession,
    (request, response, next) => {
      const handle = async (): Promise<void> => {
        const { eventId, invitationId } = parseOrThrow(invitationParamsSchema, request.params);
        const identity = identityOf(request);

        await requireEventAdministrator(deps.database, identity, eventId);

        const cancelled = await cancelInvitation(deps.database, {
          eventId,
          invitationId,
          now: deps.now(),
        });

        if (!cancelled) {
          // No existe o es de otro evento: desde aquí no se distingue de una que no existe.
          throw new AppError('not_found');
        }

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
      const now = deps.now();
      const invitation = await issueInvitation(deps.database, {
        eventId,
        tokenHash: hashToken(token),
        createdBy: identity.user?.id ?? ownerUserId,
        now,
        expiresAt: invitationExpiry(now),
      });

      const payload: CreatedInvitation = {
        id: invitation.id,
        token,
        expiresAt: invitation.expiresAt.toISOString(),
        maxUses: INVITATION_MAX_USES,
        label: invitation.label,
      };
      response.status(201).json(payload);
    };

    void handle().catch(next);
  });

  return router;
}
