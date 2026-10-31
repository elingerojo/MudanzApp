/**
 * Desarrollo: `ng serve` proxya `/api` hacia el backend local (`proxy.conf.json`), así que no hay
 * CORS. El valor lo resuelve el bundler; nunca se lee `process.env` en el navegador.
 */
export const environment = { apiBaseUrl: '/api' };
