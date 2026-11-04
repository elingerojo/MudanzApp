import { Router } from '@angular/router';
import {
  OAuthFlowError,
  createCodeVerifier,
  createOAuthState,
  oauthStateMatches,
} from '@mudanzapp/shared';

import type { ShopOAuthCallbackParams, ShopOAuthFlow, ShopOAuthResult } from './shop-oauth-flow';
import {
  clearShopPendingFlow,
  readShopPendingFlow,
  saveShopPendingFlow,
} from './shop-oauth-pending';

/** Código y token del doble: constantes, para que el arnés no dependa de nada externo. */
export const FAKE_SHOP_OAUTH_CODE = 'fake-shop-authorization-code';
export const FAKE_SHOP_ID_TOKEN = 'fake-id-token';

/**
 * Doble determinista del flujo de la tienda.
 *
 * No sale del navegador: `begin()` navega a `/auth/callback` con un código y el `state` que acaba de
 * guardar, y `complete()` devuelve un `id_token` fijo. El `state` se verifica igual que en `live`,
 * porque la prueba de esa defensa es parte del corte y un doble más permisivo la escondería. El
 * backend corre con `OAUTH_MODE=fake`, así que acepta este token sin proveedor.
 */
export class FakeShopOAuthFlow implements ShopOAuthFlow {
  constructor(private readonly router: Router) {}

  async begin(): Promise<void> {
    const verifier = createCodeVerifier();
    const state = createOAuthState();
    saveShopPendingFlow({ verifier, state });

    await this.router.navigate(['/auth/callback'], {
      queryParams: { code: FAKE_SHOP_OAUTH_CODE, state },
    });
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

    return { idToken: FAKE_SHOP_ID_TOKEN };
  }
}
