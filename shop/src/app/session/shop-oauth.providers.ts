import { inject, type Provider } from '@angular/core';
import { Router } from '@angular/router';

import { environment } from '../../environments/environment';
import { SHOP_OAUTH_FLOW, type ShopOAuthFlow } from './shop-oauth-flow';
import { FakeShopOAuthFlow } from './shop-oauth-flow.fake';
import { LiveShopOAuthFlow } from './shop-oauth-flow.live';

/**
 * Elige la implementación del flujo por **configuración compilada** (ciclo 4d).
 *
 * `environment.oauth.mode` se intercambia con `fileReplacements`: el bundle de producción lleva `live`
 * y el de desarrollo y el arnés, `fake`. Ninguna plantilla ni servicio decide el modo.
 */
export function provideShopOAuthFlow(): Provider[] {
  return [
    {
      provide: SHOP_OAUTH_FLOW,
      useFactory: (): ShopOAuthFlow => {
        const config = environment.oauth;

        return config.mode === 'fake'
          ? new FakeShopOAuthFlow(inject(Router))
          : new LiveShopOAuthFlow(config, environment.apiBaseUrl);
      },
    },
  ];
}
