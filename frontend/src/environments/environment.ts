import type { OAuthClientConfig } from '../app/session/oauth-config';

/**
 * Desarrollo: `ng serve` proxya `/api` hacia el backend local (`proxy.conf.json`), así que no hay
 * CORS. El valor lo resuelve el bundler; nunca se lee `process.env` en el navegador.
 *
 * `shopBaseUrl` es el origen del tercer frontend en el dev loop (puerto `4202`, `Man-2.5`), sin barra
 * final: el enlace publicado se compone añadiéndole `/<slug>`.
 *
 * `oauth` es la identidad de cuenta del ciclo 4c-1. En desarrollo y en el arnés el modo es `fake`: el
 * doble del flujo devuelve un token determinista y el backend corre con `OAUTH_MODE=fake`, así que
 * ninguna prueba depende del proveedor (`stack` §9). El emisor del doble coincide con el que usa
 * `createFakeOAuthVerifier` para que una revisión local no necesite configuración.
 */
export const environment: {
  readonly apiBaseUrl: string;
  readonly shopBaseUrl: string;
  readonly oauth: OAuthClientConfig;
} = {
  apiBaseUrl: '/api',
  shopBaseUrl: 'http://localhost:4202',
  oauth: {
    mode: 'fake',
    issuer: 'https://fake.oauth.local',
    clientId: 'mudanzapp-local',
  },
};
