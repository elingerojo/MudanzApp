import type { OAuthClientConfig } from '../app/session/oauth-config';

/**
 * Producción: el valor se compila dentro del bundle y `fileReplacements` lo intercambia solo en
 * la configuración `production`.
 *
 * El origen es el dominio público del backend en Railway (manual `Man-3.4`), sin barra final:
 * cada consumidor le añade su propia ruta (`${apiBaseUrl}/health` en el humo de estado).
 *
 * `shopBaseUrl` es el Worker público (`mudanzapp-shop`) del subdominio `workers.dev` observado, sin
 * barra final. Si el `name` del Worker cambia, este valor se recompila; ninguna ruta lo devuelve.
 *
 * `oauth` entra en `live` con los **hechos del dueño** de `plan-ciclo-4c` §14 compilados el
 * 2026-11-03: el emisor de Google y el `client_id` del cliente público. Ninguno es un secreto —viajan
 * en el bundle de cualquier cliente PKCE—; el `client_secret` vive solo en el backend, que es el
 * único que canjea el código. La contraparte en Railway es `OAUTH_MODE=live` con `OAUTH_ISSUER`,
 * `OAUTH_CLIENT_ID` y `OAUTH_CLIENT_SECRET`; sin ella el canje responde el mismo
 * `oauth_not_configured`.
 *
 * El URI de vuelta se deriva del origen del navegador (`oauth-config.ts`), no del bundle, así que
 * este despliegue exige tener registrado `https://mudanzapp.elingerojo.workers.dev/auth/callback` en
 * el proveedor; sin ese registro Google responde `redirect_uri_mismatch`. Una cadena vacía cuenta
 * como ausente y el flujo falla con `oauth_not_configured` sin redirigir a un emisor inventado.
 */
export const environment: {
  readonly apiBaseUrl: string;
  readonly shopBaseUrl: string;
  readonly oauth: OAuthClientConfig;
} = {
  apiBaseUrl: 'https://mudanzappbackend-production.up.railway.app',
  shopBaseUrl: 'https://mudanzapp-shop.elingerojo.workers.dev',
  oauth: {
    mode: 'live',
    issuer: 'https://accounts.google.com',
    clientId: '415847053935-mf9kh5irtpllqva963vms94jat6iigo5.apps.googleusercontent.com',
  },
};
