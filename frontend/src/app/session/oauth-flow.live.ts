import {
  authorizeUrl,
  codeChallengeS256,
  createCodeVerifier,
  createOAuthState,
  oauthDiscoverySchema,
  oauthStateMatches,
  oauthTokenResponseSchema,
  tokenRequestBody,
  type OAuthDiscovery,
} from '@mudanzapp/shared';

import { oauthConfigured, oauthRedirectUri, type OAuthClientConfig } from './oauth-config';
import { OAuthFlowError, type OAuthCallbackParams, type OAuthFlow } from './oauth-flow';
import { clearPendingFlow, readPendingFlow, savePendingFlow } from './oauth-session';

/**
 * Adaptador `live`: el proveedor real (ciclo 4c-1).
 *
 * Tres decisiones que no cambian con el emisor:
 * - el descubrimiento se valida con `zod` antes de usarse, porque es la salida de una integración
 *   externa (`stack` §9);
 * - el canje es de cliente **público**: viaja `code_verifier` y nunca un `client_secret`;
 * - `fetch` directo y no `HttpClient`: la llamada sale hacia el emisor, no hacia el backend, y así no
 *   pasa por ningún interceptor de la aplicación.
 *
 * Aquí no se emite ni se guarda ninguna sesión: el `id_token` es la entrada de `POST /auth/claim`.
 */
export class LiveOAuthFlow implements OAuthFlow {
  constructor(private readonly config: OAuthClientConfig) {}

  async begin(): Promise<void> {
    if (!oauthConfigured(this.config)) {
      throw new OAuthFlowError('oauth_not_configured');
    }

    const verifier = createCodeVerifier();
    const state = createOAuthState();
    savePendingFlow({ verifier, state });

    const discovery = await discover(this.config.issuer);
    const codeChallenge = await codeChallengeS256(verifier);

    globalThis.location.assign(
      authorizeUrl({
        authorizationEndpoint: discovery.authorization_endpoint,
        clientId: this.config.clientId,
        redirectUri: oauthRedirectUri(),
        codeChallenge,
        state,
      }),
    );
  }

  async complete(params: OAuthCallbackParams): Promise<string> {
    if (params.error !== null) {
      clearPendingFlow();
      throw new OAuthFlowError('oauth_denied');
    }

    const pending = readPendingFlow();
    clearPendingFlow();

    if (pending === null || !oauthStateMatches(pending.state, params.state)) {
      // Sin el `state` de esta visita no se canjea nada: es la defensa contra una respuesta inyectada.
      throw new OAuthFlowError('oauth_state_mismatch');
    }

    if (!oauthConfigured(this.config)) {
      throw new OAuthFlowError('oauth_not_configured');
    }

    const code = params.code;
    if (code === null || code.length === 0) {
      throw new OAuthFlowError('oauth_invalid_token');
    }

    const discovery = await discover(this.config.issuer);
    const body = tokenRequestBody({
      code,
      codeVerifier: pending.verifier,
      clientId: this.config.clientId,
      redirectUri: oauthRedirectUri(),
    });

    return exchange(discovery, body);
  }
}

/** Descubre los dos endpoints del flujo. Un emisor inalcanzable o un documento inválido falla ruidoso. */
async function discover(issuer: string): Promise<OAuthDiscovery> {
  const base = issuer.trim().replace(/\/+$/, '');

  let response: Response;
  try {
    response = await fetch(`${base}/.well-known/openid-configuration`, {
      headers: { accept: 'application/json' },
    });
  } catch {
    throw new OAuthFlowError('oauth_unavailable');
  }

  if (!response.ok) {
    throw new OAuthFlowError('oauth_unavailable');
  }

  const body: unknown = await response.json().catch(() => null);
  const parsed = oauthDiscoverySchema.safeParse(body);
  if (!parsed.success) {
    throw new OAuthFlowError('oauth_unavailable');
  }

  return parsed.data;
}

async function exchange(discovery: OAuthDiscovery, body: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body,
    });
  } catch {
    throw new OAuthFlowError('oauth_unavailable');
  }

  if (!response.ok) {
    throw new OAuthFlowError('oauth_invalid_token');
  }

  const payload: unknown = await response.json().catch(() => null);
  const parsed = oauthTokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new OAuthFlowError('oauth_invalid_token');
  }

  return parsed.data.id_token;
}
