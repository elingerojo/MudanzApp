import type { OAuthConfig } from '../config.js';
import { createFakeOAuthVerifier } from './oauth-fake.js';
import { createLiveOAuthVerifier } from './oauth-live.js';

/**
 * Costura de la integración OAUTH (`decisiones` §21).
 *
 * Existe porque compra aprendizaje: el doble `fake` permite e2e determinista y el adaptador `live`
 * verifica el token en la frontera. La frontera HTTP solo ve esta interfaz; el modo se resuelve una
 * sola vez en el arranque y **no** se lee `process.env` aquí.
 */

export interface OAuthIdentity {
  readonly issuer: string;
  readonly subject: string;
  readonly displayName: string;
}

export interface OAuthVerifier {
  verify(token: string): Promise<OAuthIdentity>;
}

export type OAuthErrorCode = 'oauth_invalid_token' | 'oauth_not_configured' | 'oauth_mode_invalid';

/** Fallo de la integración con código estable; el borde lo traduce a `AppError`. */
export class OAuthError extends Error {
  readonly code: OAuthErrorCode;

  constructor(code: OAuthErrorCode) {
    super(code);
    this.name = 'OAuthError';
    this.code = code;
  }
}

export function createOAuthVerifier(config: OAuthConfig): OAuthVerifier {
  if (config.mode === 'fake') {
    return createFakeOAuthVerifier(config);
  }

  if (config.mode === 'live') {
    return createLiveOAuthVerifier(config);
  }

  // Un valor de modo inválido falla en la primera petición, con código estable (`00-stack`).
  return {
    verify: () => Promise.reject(new OAuthError('oauth_mode_invalid')),
  };
}
