import type { IdentityUser, SessionScope } from '@mudanzapp/shared';
import type { Request, RequestHandler } from 'express';

import type { Database } from '../db.js';
import { sessionCoversScope, sessionOwner, sessionUsability } from '../domain/account.js';
import { AppError } from '../errors.js';
import { findSessionByTokenHash, touchSession } from '../store/identity-store.js';
import { bearerToken, hashToken } from '../tokens.js';
import { toIdentityUser } from './presenters.js';

/** Identidad resuelta de la petición: la sesión usada y su dueño. */
export interface RequestIdentity {
  readonly sessionId: string;
  readonly scope: SessionScope;
  /** `null` en una sesión de evento: prueba pertenencia a un evento, no identidad. */
  readonly user: IdentityUser | null;
  /** Evento de la sesión cuando es de evento; `null` cuando es de cuenta. */
  readonly eventId: string | null;
}

const requestIdentities = new WeakMap<Request, RequestIdentity>();

export function identityOf(request: Request): RequestIdentity {
  const identity = requestIdentities.get(request);
  if (identity === undefined) {
    throw new AppError('unauthorized');
  }

  return identity;
}

/**
 * Frontera de sesión: token opaco en `Authorization: Bearer`, hash en la base, revocación por
 * dispositivo. Una sesión revocada se distingue de un token desconocido para que la evidencia del
 * ciclo diga qué ocurrió.
 *
 * La sesión puede ser **de cuenta** o **de evento** (`decisiones` §30). El middleware no exige
 * sujeto: eso lo decide la ruta que consume la sesión.
 *
 * El alcance es exacto (`sessionCoversScope`): una sesión de aplicación no sirve en la tienda y una de
 * tienda no sirve en las rutas del evento (ciclo 4d). El default `app` conserva los llamadores que ya
 * existían; solo el router de la tienda pide `shop`.
 */
export function createSessionMiddleware(
  database: Database,
  requiredScope: SessionScope = 'app',
): RequestHandler {
  return (request, _response, next): void => {
    const resolve = async (): Promise<void> => {
      const token = bearerToken(request.headers.authorization);
      if (token === null) {
        throw new AppError('unauthorized');
      }

      const session = await findSessionByTokenHash(database, hashToken(token));
      if (session === null) {
        throw new AppError('unauthorized');
      }

      const usability = sessionUsability(session);
      if (!usability.usable) {
        throw new AppError('session_revoked');
      }

      if (!sessionCoversScope(session.scope, requiredScope)) {
        throw new AppError('unauthorized');
      }

      const owner = sessionOwner({ userId: session.userId, eventId: session.eventId });
      if (owner === null) {
        // Fila imposible: la restricción del modelo la impide. Si aparece, falla en vez de adivinar.
        throw new AppError('internal_error');
      }

      await touchSession(database, session.id);
      requestIdentities.set(request, {
        sessionId: session.id,
        scope: session.scope,
        user: session.user === null ? null : toIdentityUser(session.user),
        eventId: owner.kind === 'event' ? owner.eventId : null,
      });
      next();
    };

    void resolve().catch(next);
  };
}
