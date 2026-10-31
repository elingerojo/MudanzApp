/**
 * Producción: el valor se compila dentro del bundle y `fileReplacements` lo intercambia solo en
 * la configuración `production`.
 *
 * El origen es el dominio público del backend en Railway (manual `Man-3.4`), sin barra final:
 * cada consumidor le añade su propia ruta (`${apiBaseUrl}/health` en el humo de estado).
 */
export const environment = { apiBaseUrl: 'https://mudanzappbackend-production.up.railway.app' };
