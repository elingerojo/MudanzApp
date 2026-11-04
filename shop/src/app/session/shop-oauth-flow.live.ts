import {
  OAuthFlowError,
  authorizeUrl,
  codeChallengeS256,
  createCodeVerifier,
  createOAuthState,
  discoverOAuth,
  exchangeAuthorizationCode,
  oauthConfigured,
  oauthRedirectUri,
  oauthStateMatches,
  type FetchLike,
  type OAuthClientConfig,
} from '@mudanzapp/shared';

import type { ShopOAuthCallbackParams, ShopOAuthFlow, ShopOAuthResult } from './shop-oauth-flow';
import {
  clearShopPendingFlow,
  readShopPendingFlow,
  saveShopPendingFlow,
} from './shop-oauth-pending';

/** `fetch` se resuelve en cada llamada para que la prueba pueda sustituirlo sin reimportar módulos. */
const fetchImpl: FetchLike = (input, init) => fetch(input, init);

/**
 * Adaptador `live` del flujo de la tienda.
 *
 * El navegador solo conserva la mitad pública: descubre el `authorization_endpoint`, redirige con el
 * `challenge` y, a la vuelta, entrega el código y su verificador al backend, que hace el canje con su
 * secreto. La composición de PKCE y el canje son los de `shared`, los mismos que usa `frontend`.
 */
export class LiveShopOAuthFlow implements ShopOAuthFlow {
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
    saveShopPendingFlow({ verifier, state });

    const discovery = await discoverOAuth(this.config.issuer, fetchImpl);
    if (!discovery.ok) {
      throw new OAuthFlowError(discovery.code);
    }

    const codeChallenge = await codeChallengeS256(verifier);

    globalThis.location.assign(
      authorizeUrl({
        authorizationEndpoint: discovery.value.authorization_endpoint,
        clientId: this.config.clientId,
        redirectUri: oauthRedirectUri(globalThis.location.origin),
        codeChallenge,
        state,
      }),
    );
  }

  async complete(params: ShopOAuthCallbackParams): Promise<ShopOAuthResult> {
    if (params.error !== null) {
      clearShopPendingFlow();
      throw new OAuthFlowError('oauth_denied');
    }

    const pending = readShopPendingFlow();
    clearShopPendingFlow();

    if (
      pending === null ||
      pending.purpose !== 'shop' ||
      !oauthStateMatches(pending.state, params.state)
    ) {
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
        redirectUri: oauthRedirectUri(globalThis.location.origin),
      },
      fetchImpl,
    );

    if (!exchange.ok) {
      throw new OAuthFlowError(exchange.code);
    }

    return { idToken: exchange.value };
  }
}
