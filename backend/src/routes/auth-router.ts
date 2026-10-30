import {
  claimEventSchema,
  createSessionSchema,
  redeemInvitationSchema,
  type IssuedSession,
} from '@mudanzapp/shared';
import { Router } from 'express';

import { INVITATION_MAX_USES, invitationUsability, normalizeIssuer } from '../domain/account.js';
import { AppError } from '../errors.js';
import {
  addEventMember,
  createFactor,
  createSession,
  createUser,
  findEventById,
  findEventForUser,
  findEventOwnerUserId,
  findFactor,
  findInvitationForUpdate,
  increaseInvitationUse,
  listEventsForUser,
  revokeSession,
  touchFactor,
} from '../store/identity-store.js';
import { createOpaqueToken, hashToken } from '../tokens.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { toEventSummary, toIdentityUser } from './presenters.js';
import { createSessionMiddleware, identityOf } from './session.js';

/**
 * Entrada de identidad: canje del enlace, reclamo con cuenta y sesión del segundo dispositivo.
 *
 * El canje **no** pide identidad: emite una sesión de evento y el invitado documenta sin cuenta
 * (`decisiones` §30). El reclamo es **aditivo**: añade la cuenta como miembro con `invited_by` igual
 * al dueño del evento y emite la sesión de cuenta, sin cerrar invitaciones ni revocar las sesiones
 * de los demás co-dispositivos. La sesión del segundo dispositivo exige una cuenta ya reclamada: es
 * el camino de regreso cuando el navegador perdió su almacenamiento.
 */
export function createAuthRouter(deps: IdentityDeps): Router {
  const router = Router();
  const requireSession = createSessionMiddleware(deps.database);

  router.post('/auth/redeem', (request, response, next) => {
    const handle = async (): Promise<void> => {
      const input = parseOrThrow(redeemInvitationSchema, request.body);
      const now = deps.now();
      const sessionToken = createOpaqueToken();

      const event = await deps.database.transaction(async (transaction) => {
        const invitation = await findInvitationForUpdate(transaction, hashToken(input.inviteToken));
        if (invitation === null || !invitationUsability(invitation, now).usable) {
          throw new AppError('invitation_invalid');
        }

        // Canje atómico: si otro dispositivo agotó el último uso, este no escribe nada.
        const redeemed = await increaseInvitationUse(transaction, {
          invitationId: invitation.id,
          maxUses: INVITATION_MAX_USES,
          now,
          userId: null,
        });
        if (!redeemed) {
          throw new AppError('invitation_invalid');
        }

        await createSession(transaction, {
          userId: null,
          eventId: invitation.eventId,
          tokenHash: hashToken(sessionToken),
          scope: 'app',
          deviceLabel: input.deviceLabel ?? null,
        });

        const redeemedEvent = await findEventById(transaction, invitation.eventId);
        if (redeemedEvent === null) {
          throw new AppError('internal_error');
        }

        return redeemedEvent;
      });

      const payload: IssuedSession = {
        sessionToken,
        scope: 'app',
        user: null,
        event: toEventSummary({ ...event, role: null }),
      };
      response.status(201).json(payload);
    };

    void handle().catch(next);
  });

  router.post('/auth/claim', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const identity = identityOf(request);
      if (identity.eventId === null) {
        // Ya es una sesión de cuenta: el enlace no es el camino, el segundo dispositivo sí.
        throw new AppError('session_not_claimable');
      }

      const input = parseOrThrow(claimEventSchema, request.body);
      const verified = await deps.oauth.verify(input.oauthToken);
      const issuer = normalizeIssuer(verified.issuer);
      const { eventId } = identity;
      const sessionToken = createOpaqueToken();

      const result = await deps.database.transaction(async (transaction) => {
        let factor = await findFactor(transaction, issuer, verified.subject);
        if (factor === null) {
          const user = await createUser(transaction, verified.displayName);
          const factorId = await createFactor(transaction, {
            userId: user.id,
            issuer,
            subject: verified.subject,
          });
          factor = { factorId, user };
        } else {
          await touchFactor(transaction, factor.factorId);
        }

        const ownerUserId = await findEventOwnerUserId(transaction, eventId);
        if (ownerUserId === null) {
          throw new AppError('internal_error');
        }

        // `invited_by` es el dueño del evento: el único invitante de registro que el modelo reconoce
        // (`decisiones` §30). El reclamo no acredita una invitación concreta.
        await addEventMember(transaction, {
          eventId,
          userId: factor.user.id,
          role: 'member',
          invitedBy: ownerUserId,
        });

        await createSession(transaction, {
          userId: factor.user.id,
          eventId: null,
          tokenHash: hashToken(sessionToken),
          scope: 'app',
          deviceLabel: input.deviceLabel ?? null,
        });

        // Aditivo: solo se revoca la sesión que se está reclamando, porque el cliente la sustituye
        // en `localStorage`. Las demás sesiones del evento siguen válidas (`decisiones` §30).
        await revokeSession(transaction, identity.sessionId);

        const membership = await findEventForUser(transaction, eventId, factor.user.id);
        if (membership === null) {
          throw new AppError('internal_error');
        }

        return { user: factor.user, event: membership };
      });

      const payload: IssuedSession = {
        sessionToken,
        scope: 'app',
        user: toIdentityUser(result.user),
        event: toEventSummary(result.event),
      };
      response.status(201).json(payload);
    };

    void handle().catch(next);
  });

  router.post('/auth/sessions', (request, response, next) => {
    const handle = async (): Promise<void> => {
      const input = parseOrThrow(createSessionSchema, request.body);
      const identity = await deps.oauth.verify(input.oauthToken);
      const issuer = normalizeIssuer(identity.issuer);

      const factor = await findFactor(deps.database, issuer, identity.subject);
      if (factor === null) {
        // Sin un evento reclamado no hay a qué volver: la cuenta sola no basta.
        throw new AppError('account_not_linked');
      }

      const sessionToken = createOpaqueToken();
      await deps.database.transaction(async (transaction) => {
        await createSession(transaction, {
          userId: factor.user.id,
          eventId: null,
          tokenHash: hashToken(sessionToken),
          scope: 'app',
          deviceLabel: input.deviceLabel ?? null,
        });
        await touchFactor(transaction, factor.factorId);
      });

      const events = await listEventsForUser(deps.database, factor.user.id);
      const [firstEvent] = events;
      const payload: IssuedSession = {
        sessionToken,
        scope: 'app',
        user: toIdentityUser(factor.user),
        event: firstEvent === undefined ? null : toEventSummary(firstEvent),
      };
      response.status(201).json(payload);
    };

    void handle().catch(next);
  });

  return router;
}
