import {
  authorizeUrl,
  codeChallengeS256,
  createCodeVerifier,
  createOAuthState,
  oauthDiscoverySchema,
  oauthStateMatches,
  type OAuthDiscovery,
} from '@mudanzapp/shared';

import { oauthConfigured, oauthRedirectUri, type OAuthClientConfig } from './oauth-config';
import {
  OAuthFlowError,
  type OAuthCallbackParams,
  type OAuthFlow,
  type OAuthFlowErrorCode,
} from './oauth-flow';
import { clearPendingFlow, readPendingFlow, savePendingFlow } from './oauth-session';

/**
 * Adaptador `live`: el proveedor real (ciclo 4c-1 y su corrección 4c-1b).
 *
 * El navegador conserva **solo la mitad pública** del flujo: descubre los endpoints, redirige con el
 * `challenge` y, a la vuelta, entrega el código y su verificador al backend, que hace el canje.
 *
 * El canje no puede vivir aquí: el proveedor exige autenticación de cliente —Google publica
 * `token_endpoint_auth_methods_supported` sin `none`— y un SPA desplegado no puede guardar el
 * `client_secret`. El backend devuelve el `id_token` ya verificado y este adaptador lo entrega al
 * reclamo, sin emitir ni guardar sesiones.
 *
 * El `state` se verifica igual que en el doble, y el verificador no se reutiliza: se borra en cuanto se
 * entrega.
 */
export class LiveOAuthFlow implements OAuthFlow {
  constructor(
    private readonly config: OAuthClientConfig,
    private readonly apiBaseUrl: string,
  ) {}

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
      // Sin el `state` de esta visita no se entrega nada al backend: es la defensa contra una respuesta
      // inyectada.
      throw new OAuthFlowError('oauth_state_mismatch');
    }

    const code = params.code;
    if (code === null || code.length === 0) {
      throw new OAuthFlowError('oauth_invalid_token');
    }

    return this.exchange({
      code,
      codeVerifier: pending.verifier,
      redirectUri: oauthRedirectUri(),
    });
  }

  /**
   * Canje por el backend. La respuesta es el `id_token` ya verificado contra el JWKS del emisor; un
   * fallo se traduce por **código**, nunca por el texto del borde.
   */
  private async exchange(input: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
  }): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.apiBaseUrl}/auth/oauth/exchange`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(input),
      });
    } catch {
      throw new OAuthFlowError('oauth_unavailable');
    }

    if (!response.ok) {
      throw new OAuthFlowError(await failureCode(response));
    }

    const payload: unknown = await response.json().catch(() => null);
    const token =
      typeof payload === 'object' && payload !== null && 'oauthToken' in payload
        ? (payload as { oauthToken?: unknown }).oauthToken
        : undefined;

    if (typeof token !== 'string' || token.length === 0) {
      throw new OAuthFlowError('oauth_invalid_token');
    }

    return token;
  }
}

/** Código del borde, acotado a los que este flujo sabe explicar; el resto es indisponibilidad. */
async function failureCode(response: Response): Promise<OAuthFlowErrorCode> {
  const body: unknown = await response.json().catch(() => null);
  const candidate =
    typeof body === 'object' && body !== null && 'error' in body
      ? (body as { error?: unknown }).error
      : undefined;

  if (candidate === 'oauth_invalid_token' || candidate === 'oauth_not_configured') {
    return candidate;
  }

  return 'oauth_unavailable';
}

/** Descubre los endpoints públicos del flujo. Un documento inválido falla ruidoso, no se adivina. */
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
