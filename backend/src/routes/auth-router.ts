import { createSessionSchema, redeemInvitationSchema, type IssuedSession } from '@mudanzapp/shared';
import { Router } from 'express';

import { invitationUsability, normalizeIssuer } from '../domain/account.js';
import { AppError } from '../errors.js';
import {
  addEventMember,
  consumeInvitation,
  createFactor,
  createSession,
  createUser,
  findEventForUser,
  findFactor,
  findInvitationForUpdate,
  listEventsForUser,
  touchFactor,
} from '../store/identity-store.js';
import { createOpaqueToken, hashToken } from '../tokens.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { toEventSummary, toIdentityUser } from './presenters.js';

/**
 * Entrada de identidad: canje del enlace de invitación y sesión del segundo dispositivo.
 *
 * Los dos factores son dos pasos (`decisiones` §22): la invitación prueba que el sujeto fue
 * autorizado a un evento concreto y la cuenta OAuth prueba que es la misma persona. El token de
 * sesión se emite aquí, se devuelve una sola vez y la base solo guarda su hash.
 */
export function createAuthRouter(deps: IdentityDeps): Router {
  const router = Router();

  router.post('/auth/redeem', (request, response, next) => {
    const handle = async (): Promise<void> => {
      const input = parseOrThrow(redeemInvitationSchema, request.body);
      const identity = await deps.oauth.verify(input.oauthToken);
      const issuer = normalizeIssuer(identity.issuer);
      const now = deps.now();
      const sessionToken = createOpaqueToken();

      const result = await deps.database.transaction(async (transaction) => {
        const invitation = await findInvitationForUpdate(transaction, hashToken(input.inviteToken));
        if (invitation === null || !invitationUsability(invitation, now).usable) {
          throw new AppError('invitation_invalid');
        }

        let factor = await findFactor(transaction, issuer, identity.subject);
        if (factor === null) {
          const user = await createUser(transaction, identity.displayName);
          const factorId = await createFactor(transaction, {
            userId: user.id,
            issuer,
            subject: identity.subject,
          });
          factor = { factorId, user };
        } else {
          await touchFactor(transaction, factor.factorId);
        }

        // Consumo atómico: si otro dispositivo ganó la carrera, el enlace ya no sirve.
        if (!(await consumeInvitation(transaction, invitation.id, factor.user.id))) {
          throw new AppError('invitation_invalid');
        }

        await addEventMember(transaction, {
          eventId: invitation.eventId,
          userId: factor.user.id,
          role: 'member',
          invitedBy: invitation.createdBy,
        });

        await createSession(transaction, {
          userId: factor.user.id,
          tokenHash: hashToken(sessionToken),
          scope: 'app',
          deviceLabel: input.deviceLabel ?? null,
        });

        return {
          user: factor.user,
          event: await findEventForUser(transaction, invitation.eventId, factor.user.id),
        };
      });

      const payload: IssuedSession = {
        sessionToken,
        scope: 'app',
        user: toIdentityUser(result.user),
        event: result.event === null ? null : toEventSummary(result.event),
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
        // Sin invitación canjeada no hay evento al que pertenecer: la cuenta sola no basta.
        throw new AppError('account_not_linked');
      }

      const sessionToken = createOpaqueToken();
      await deps.database.transaction(async (transaction) => {
        await createSession(transaction, {
          userId: factor.user.id,
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
