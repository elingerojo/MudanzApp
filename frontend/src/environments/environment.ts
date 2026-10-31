/**
 * Desarrollo: `ng serve` proxya `/api` hacia el backend local (`proxy.conf.json`), así que no hay
 * CORS. El valor lo resuelve el bundler; nunca se lee `process.env` en el navegador.
 *
 * `shopBaseUrl` es el origen del tercer frontend en el dev loop (puerto `4202`, `Man-2.5`), sin barra
 * final: el enlace publicado se compone añadiéndole `/<slug>`.
 */
export const environment = {
  apiBaseUrl: '/api',
  shopBaseUrl: 'http://localhost:4202',
};
