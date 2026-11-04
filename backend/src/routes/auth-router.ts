import {
  claimEventSchema,
  createSessionSchema,
  oauthExchangeSchema,
  redeemInvitationSchema,
  shopSessionSchema,
  updateShopProfileSchema,
  type IssuedSession,
  type OAuthExchange,
  type ShopIdentity,
} from '@mudanzapp/shared';
import { Router } from 'express';

import { INVITATION_MAX_USES, invitationUsability, normalizeIssuer } from '../domain/account.js';
import { AppError } from '../errors.js';
import { OAuthError } from '../identity/oauth.js';
import {
  addEventMember,
  claimEventAdmin,
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
  updateUserDisplayName,
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
  // La tienda consume el mismo middleware con su alcance exacto (ciclo 4d): un token de aplicación
  // no abre estas rutas y uno de tienda no abre las del evento.
  const requireShopSession = createSessionMiddleware(deps.database, 'shop');

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

  /**
   * Canje del código en el **canal trasero** (ciclo 4c-1b). Sin sesión: la identidad la prueba el
   * `id_token` que el proveedor firma, y el canje exige el secreto del cliente, que solo vive aquí.
   *
   * `redirectUri` viene del navegador porque el proveedor exige el mismo que se usó al autorizar y el
   * servidor no conoce el origen del frontend; el proveedor es la autoridad sobre él, y un valor que no
   * coincida hace fallar el canje.
   */
  router.post('/auth/oauth/exchange', (request, response, next) => {
    const handle = async (): Promise<void> => {
      const input = parseOrThrow(oauthExchangeSchema, request.body);

      const exchange = deps.oauth.exchangeCode;
      if (exchange === undefined) {
        // `fake` no tiene proveedor al que canjear: es su estado real, no un fallo.
        throw new AppError('oauth_not_configured');
      }

      try {
        const oauthToken = await exchange(input);
        const payload: OAuthExchange = { oauthToken };
        response.json(payload);
      } catch (error: unknown) {
        if (error instanceof OAuthError) {
          throw new AppError(error.code);
        }

        throw error;
      }
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

        // El event-administrator se reclama aquí y solo aquí: la primera autenticación de cuenta que
        // llega desde una sesión de **este** evento. Es idempotente y su resultado se ignora a
        // propósito —un evento ya reclamado no es un fallo de la autenticación— (decisión §37).
        await claimEventAdmin(transaction, { eventId, userId: factor.user.id });

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

  /**
   * Primer acceso o regreso de un visitante de la tienda (ciclo 4d, `shop-account`).
   *
   * No exige credencial: la identidad la prueba el `id_token` que el proveedor firma. Si el par
   * `(issuer, subject)` no tiene factor, este es el **alta**: crea la cuenta y su factor. Después emite
   * una sesión de alcance `shop` con sujeto y sin evento. No añade membresía, no reclama el evento y no
   * revoca ninguna sesión de otra superficie.
   */
  router.post('/auth/shop/sessions', (request, response, next) => {
    const handle = async (): Promise<void> => {
      const input = parseOrThrow(shopSessionSchema, request.body);
      const verified = await deps.oauth.verify(input.oauthToken);
      const issuer = normalizeIssuer(verified.issuer);
      const sessionToken = createOpaqueToken();

      const user = await deps.database.transaction(async (transaction) => {
        let factor = await findFactor(transaction, issuer, verified.subject);
        if (factor === null) {
          const created = await createUser(transaction, verified.displayName);
          const factorId = await createFactor(transaction, {
            userId: created.id,
            issuer,
            subject: verified.subject,
          });
          factor = { factorId, user: created };
        } else {
          await touchFactor(transaction, factor.factorId);
        }

        await createSession(transaction, {
          userId: factor.user.id,
          eventId: null,
          tokenHash: hashToken(sessionToken),
          scope: 'shop',
          deviceLabel: input.deviceLabel ?? null,
        });

        return factor.user;
      });

      const payload: IssuedSession = {
        sessionToken,
        scope: 'shop',
        user: toIdentityUser(user),
        event: null,
      };
      response.status(201).json(payload);
    };

    void handle().catch(next);
  });

  /**
   * Identidad de la tienda (ciclo 4d): solo una sesión de alcance `shop`.
   *
   * Una fila `shop` sin sujeto es imposible por `session_owner_check`; si apareciera, falla con
   * `unauthorized` en vez de inventar un dueño.
   */
  router.get('/auth/shop/session', requireShopSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const identity = identityOf(request);
      if (identity.user === null) {
        throw new AppError('unauthorized');
      }

      const payload: ShopIdentity = {
        user: identity.user,
        session: { id: identity.sessionId, scope: identity.scope },
      };
      response.json(payload);
    };

    void handle().catch(next);
  });

  /**
   * Nombre visible opcional del visitante (ciclo 4d).
   *
   * El objetivo es siempre la fila del sujeto que la sesión resolvió; el cuerpo no lleva ni acepta un
   * identificador de usuario. Es la única escritura de perfil de la tienda.
   */
  router.patch('/auth/shop/profile', requireShopSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const identity = identityOf(request);
      if (identity.user === null) {
        throw new AppError('unauthorized');
      }

      const input = parseOrThrow(updateShopProfileSchema, request.body);
      const user = await updateUserDisplayName(deps.database, {
        userId: identity.user.id,
        displayName: input.displayName,
      });
      if (user === null) {
        throw new AppError('unauthorized');
      }

      response.json({ user: toIdentityUser(user) });
    };

    void handle().catch(next);
  });

  return router;
}
