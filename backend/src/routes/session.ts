import type { SessionScope } from '@mudanzapp/shared';
import type { Request, RequestHandler } from 'express';

import type { Database } from '../db.js';
import { sessionCoversScope, sessionUsability } from '../domain/account.js';
import { AppError } from '../errors.js';
import { findSessionByTokenHash, touchSession } from '../store/identity-store.js';
import { bearerToken, hashToken } from '../tokens.js';
import { toIdentityUser } from './presenters.js';

/** Identidad resuelta de la petición: la sesión usada y su dueño. */
export interface RequestIdentity {
  readonly sessionId: string;
  readonly scope: SessionScope;
  readonly user: {
    readonly id: string;
    readonly displayName: string;
    readonly isAdmin: boolean;
  };
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
 */
export function createSessionMiddleware(database: Database): RequestHandler {
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

      if (!sessionCoversScope(session.scope, 'app')) {
        throw new AppError('unauthorized');
      }

      await touchSession(database, session.id);
      requestIdentities.set(request, {
        sessionId: session.id,
        scope: session.scope,
        user: toIdentityUser(session.user),
      });
      next();
    };

    void resolve().catch(next);
  };
}
