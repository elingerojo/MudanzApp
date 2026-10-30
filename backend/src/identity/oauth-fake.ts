import type { OAuthConfig } from '../config.js';
import { OAuthError, type OAuthIdentity, type OAuthVerifier } from './oauth.js';

/** Emisor determinista del doble: estable para que las pruebas no dependan de configuración. */
const FAKE_ISSUER = 'https://fake.oauth.local';
/** Subject fijo exigido por el stack §7: mismo sujeto en todos los dispositivos del e2e. */
const FAKE_SUBJECT = 'fake-subject';
const FAKE_DISPLAY_NAME = 'Invitado';

/**
 * Doble determinista de la identidad de cuenta.
 *
 * No valida la forma del token: en `fake` el sujeto es fijo y el e2e controla el escenario. La
 * verificación real de firma y claims vive en el adaptador `live`.
 */
export function createFakeOAuthVerifier(config: OAuthConfig): OAuthVerifier {
  const issuer = config.issuer ?? FAKE_ISSUER;

  return {
    verify: (token: string): Promise<OAuthIdentity> => {
      if (token.trim().length === 0) {
        return Promise.reject(new OAuthError('oauth_invalid_token'));
      }

      return Promise.resolve({ issuer, subject: FAKE_SUBJECT, displayName: FAKE_DISPLAY_NAME });
    },
  };
}
