import { oauthTokenResponseSchema, tokenRequestBody } from '@mudanzapp/shared';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { OAuthConfig } from '../config.js';
import { normalizeIssuer } from '../domain/account.js';
import {
  OAuthError,
  type OAuthCodeExchange,
  type OAuthIdentity,
  type OAuthVerifier,
} from './oauth.js';

/**
 * Adaptador `live` de la integración OAUTH.
 *
 * Dos caminos del mismo proveedor:
 * - `verify` comprueba el `id_token` como JWT contra el JWKS que publica el emisor: firma, emisor,
 *   audiencia y vigencia (`decisiones` §21: «los tokens se verifican en la frontera»).
 * - `exchangeCode` hace el **canje del código en el canal trasero** (ciclo 4c-1b). Vive aquí y no en el
 *   navegador porque el proveedor exige autenticación de cliente: Google publica
 *   `token_endpoint_auth_methods_supported` sin `none`, así que no admite clientes públicos, y un SPA
 *   desplegado no puede guardar el secreto. El navegador solo conserva la mitad pública del flujo.
 *
 * El emisor y el cliente se parametrizan; nada se cablea. Solo se aceptan algoritmos asimétricos para
 * que un token `HS*` no pueda confundir la verificación.
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

/** Lo que el emisor publica y este adaptador usa: sus claves y el endpoint de canje. */
interface ProviderDiscovery {
  readonly jwks: RemoteJwks;
  readonly tokenEndpoint: string;
}

/** El documento de descubrimiento se lee una vez por emisor; `jose` cachea y rota las claves. */
const discoveryCache = new Map<string, ProviderDiscovery>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requiredString(document: unknown, key: string): string {
  const value = isRecord(document) ? document[key] : undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    // Un documento sin endpoint utilizable es una integración mal configurada, no un token inválido.
    throw new OAuthError('oauth_not_configured');
  }

  return value;
}

async function resolveDiscovery(issuer: string): Promise<ProviderDiscovery> {
  const cached = discoveryCache.get(issuer);
  if (cached !== undefined) {
    return cached;
  }

  const response = await fetch(new URL(`${issuer}/.well-known/openid-configuration`));
  if (!response.ok) {
    throw new OAuthError('oauth_not_configured');
  }

  const document: unknown = await response.json();
  const jwksUri = requiredString(document, 'jwks_uri');
  const tokenEndpoint = requiredString(document, 'token_endpoint');

  const discovery: ProviderDiscovery = {
    jwks: createRemoteJWKSet(new URL(jwksUri)),
    tokenEndpoint,
  };
  discoveryCache.set(issuer, discovery);
  return discovery;
}

export function createLiveOAuthVerifier(config: OAuthConfig): OAuthVerifier {
  /**
   * Configuración exigida por los dos caminos. Un valor ausente falla aquí, con código estable, en la
   * primera petición: `live` significa credenciales válidas, no «lo intento a medias».
   */
  const required = (): {
    readonly issuer: string;
    readonly clientId: string;
    readonly clientSecret: string;
  } => {
    const { issuer, clientId, clientSecret } = config;
    if (issuer === null || clientId === null || clientSecret === null) {
      throw new OAuthError('oauth_not_configured');
    }

    return { issuer: normalizeIssuer(issuer), clientId, clientSecret };
  };

  const verifier: OAuthVerifier = {
    async verify(token: string): Promise<OAuthIdentity> {
      const { issuer, clientId } = required();

      try {
        const { jwks } = await resolveDiscovery(issuer);
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          audience: clientId,
          algorithms: [...ASYMMETRIC_ALGORITHMS],
        });

        const { sub, name } = payload;
        if (typeof sub !== 'string' || sub.trim().length === 0) {
          throw new OAuthError('oauth_invalid_token');
        }

        return {
          issuer,
          subject: sub,
          displayName:
            typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'Invitado',
        };
      } catch (error) {
        if (error instanceof OAuthError) {
          throw error;
        }

        // Una red caída o un JWKS rancio no debe envenenar el siguiente intento.
        discoveryCache.delete(issuer);
        throw new OAuthError('oauth_invalid_token');
      }
    },

    async exchangeCode(input: OAuthCodeExchange): Promise<string> {
      const { issuer, clientId, clientSecret } = required();
      const discovery = await resolveDiscovery(issuer);

      const body = tokenRequestBody({
        code: input.code,
        codeVerifier: input.codeVerifier,
        clientId,
        redirectUri: input.redirectUri,
        clientSecret,
      });

      let response: Response;
      try {
        response = await fetch(discovery.tokenEndpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
          },
          body,
        });
      } catch {
        throw new OAuthError('oauth_unavailable');
      }

      if (!response.ok) {
        // El proveedor rechazó el canje: código vencido, reusado o un verificador que no corresponde.
        throw new OAuthError('oauth_invalid_token');
      }

      const payload: unknown = await response.json().catch(() => null);
      const parsed = oauthTokenResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new OAuthError('oauth_invalid_token');
      }

      // Se verifica antes de devolver: el navegador nunca recibe un token sin verificar.
      await verifier.verify(parsed.data.id_token);
      return parsed.data.id_token;
    },
  };

  return verifier;
}
