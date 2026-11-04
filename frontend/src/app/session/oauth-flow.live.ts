import {
  authorizeUrl,
  codeChallengeS256,
  createCodeVerifier,
  createOAuthState,
  discoverOAuth,
  exchangeAuthorizationCode,
  oauthStateMatches,
  type FetchLike,
} from '@mudanzapp/shared';

import { oauthConfigured, oauthRedirectUri, type OAuthClientConfig } from './oauth-config';
import {
  OAuthFlowError,
  type OAuthCallbackParams,
  type OAuthFlow,
  type OAuthPurpose,
  type OAuthResult,
} from './oauth-flow';
import { clearPendingFlow, readPendingFlow, savePendingFlow } from './oauth-session';

/** `fetch` se resuelve en cada llamada para que la prueba pueda sustituirlo sin reimportar módulos. */
const fetchImpl: FetchLike = (input, init) => fetch(input, init);

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
 * Desde 4d el descubrimiento y el canje delegan en `shared`: `shop` ejercita el mismo contrato y no
 * hay dos copias del borde que puedan separarse.
 */
export class LiveOAuthFlow implements OAuthFlow {
  constructor(
    private readonly config: OAuthClientConfig,
    private readonly apiBaseUrl: string,
  ) {}

  async begin(purpose: OAuthPurpose): Promise<void> {
    if (!oauthConfigured(this.config)) {
      throw new OAuthFlowError('oauth_not_configured');
    }

    const verifier = createCodeVerifier();
    const state = createOAuthState();
    savePendingFlow({ verifier, state, purpose });

    const discovery = await discoverOAuth(this.config.issuer, fetchImpl);
    if (!discovery.ok) {
      throw new OAuthFlowError(discovery.code);
    }

    const codeChallenge = await codeChallengeS256(verifier);

    globalThis.location.assign(
      authorizeUrl({
        authorizationEndpoint: discovery.value.authorization_endpoint,
        clientId: this.config.clientId,
        redirectUri: oauthRedirectUri(),
        codeChallenge,
        state,
      }),
    );
  }

  async complete(params: OAuthCallbackParams): Promise<OAuthResult> {
    if (params.error !== null) {
      clearPendingFlow();
      throw new OAuthFlowError('oauth_denied');
    }

    const pending = readPendingFlow();
    clearPendingFlow();

    if (pending === null || !oauthStateMatches(pending.state, params.state)) {
      // Sin el `state` de esta visita no se entrega nada al backend: es la defensa contra una respuesta
      // inyectada. Un registro marcado para otra superficie también cae aquí.
      throw new OAuthFlowError('oauth_state_mismatch');
    }

    const code = params.code;
    if (code === null || code.length === 0) {
      throw new OAuthFlowError('oauth_invalid_token');
    }

    const exchange = await exchangeAuthorizationCode(
      {
        apiBaseUrl: this.apiBaseUrl,
        code,
        codeVerifier: pending.verifier,
        redirectUri: oauthRedirectUri(),
      },
      fetchImpl,
    );

    if (!exchange.ok) {
      throw new OAuthFlowError(exchange.code);
    }

    return { idToken: exchange.value, purpose: pending.purpose };
  }
}
