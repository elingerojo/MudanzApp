import { inject, type Provider } from '@angular/core';
import { Router } from '@angular/router';

import { environment } from '../../environments/environment';
import { OAUTH_FLOW, type OAuthFlow } from './oauth-flow';
import { FakeOAuthFlow } from './oauth-flow.fake';
import { LiveOAuthFlow } from './oauth-flow.live';

/**
 * Elige la implementación del flujo por **configuración compilada** (ciclo 4c-1).
 *
 * `environment.oauth.mode` se intercambia con `fileReplacements`: el bundle de producción lleva
 * `live` y el de desarrollo y el arnés, `fake`. Ninguna plantilla ni servicio decide el modo, y una
 * variable de entorno del navegador no participa.
 */
export function provideOAuthFlow(): Provider[] {
  return [
    {
      provide: OAUTH_FLOW,
      useFactory: (): OAuthFlow => {
        const config = environment.oauth;

        return config.mode === 'fake'
          ? new FakeOAuthFlow(inject(Router))
          : new LiveOAuthFlow(config);
      },
    },
  ];
}
