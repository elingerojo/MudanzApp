import type { OAuthClientConfig } from '@mudanzapp/shared';

/**
 * Desarrollo: `ng serve` proxya `/api` hacia el backend local (`proxy.conf.json`), así que no hay
 * CORS. El valor lo resuelve el bundler; nunca se lee `process.env` en el navegador.
 *
 * `oauth` es la identidad de la tienda (ciclo 4d). En desarrollo y en el arnés el modo es `fake`: el
 * doble del flujo devuelve un token determinista y el backend corre con `OAUTH_MODE=fake`, así que
 * ninguna prueba depende del proveedor (`stack` §9). El emisor coincide con el del doble del backend
 * para que una revisión local no necesite configuración.
 */
export const environment: {
  readonly apiBaseUrl: string;
  readonly oauth: OAuthClientConfig;
} = {
  apiBaseUrl: '/api',
  oauth: {
    mode: 'fake',
    issuer: 'https://fake.oauth.local',
    clientId: 'mudanzapp-local',
  },
};
