import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { OAuthConfig } from '../config.js';
import { normalizeIssuer } from '../domain/account.js';
import { OAuthError, type OAuthIdentity, type OAuthVerifier } from './oauth.js';

/**
 * Adaptador `live` de la integración OAUTH.
 *
 * Verifica el token como JWT contra el JWKS que publica el emisor: firma, emisor, audiencia y
 * vigencia (`decisiones` §21: «los tokens se verifican en la frontera»). El emisor y el cliente se
 * parametrizan; nada se cablea. Solo se aceptan algoritmos asimétricos para que un token `HS*` no
 * pueda confundir la verificación.
 */
const ASYMMETRIC_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
] as const;

type RemoteJwks = ReturnType<typeof createRemoteJWKSet>;

/** El JWKS se descubre una vez por emisor; el propio `jose` cachea y rota las claves. */
const jwksCache = new Map<string, RemoteJwks>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function resolveJwks(issuer: string): Promise<RemoteJwks> {
  const cached = jwksCache.get(issuer);
  if (cached !== undefined) {
    return cached;
  }

  const response = await fetch(new URL(`${issuer}/.well-known/openid-configuration`));
  if (!response.ok) {
    throw new OAuthError('oauth_not_configured');
  }

  const document: unknown = await response.json();
  const jwksUri = isRecord(document) ? document['jwks_uri'] : undefined;
  if (typeof jwksUri !== 'string' || jwksUri.trim().length === 0) {
    throw new OAuthError('oauth_not_configured');
  }

  const jwks = createRemoteJWKSet(new URL(jwksUri));
  jwksCache.set(issuer, jwks);
  return jwks;
}

export function createLiveOAuthVerifier(config: OAuthConfig): OAuthVerifier {
  return {
    async verify(token: string): Promise<OAuthIdentity> {
      const { issuer, clientId, clientSecret } = config;
      if (issuer === null || clientId === null || clientSecret === null) {
        throw new OAuthError('oauth_not_configured');
      }

      const normalizedIssuer = normalizeIssuer(issuer);

      try {
        const jwks = await resolveJwks(normalizedIssuer);
        const { payload } = await jwtVerify(token, jwks, {
          issuer: normalizedIssuer,
          audience: clientId,
          algorithms: [...ASYMMETRIC_ALGORITHMS],
        });

        const { sub, name } = payload;
        if (typeof sub !== 'string' || sub.trim().length === 0) {
          throw new OAuthError('oauth_invalid_token');
        }

        return {
          issuer: normalizedIssuer,
          subject: sub,
          displayName:
            typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'Invitado',
        };
      } catch (error) {
        if (error instanceof OAuthError) {
          throw error;
        }

        // Una red caída o un JWKS rancio no debe envenenar el siguiente intento.
        jwksCache.delete(normalizedIssuer);
        throw new OAuthError('oauth_invalid_token');
      }
    },
  };
}
