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
 * `oauth` entra en `live`: el flujo va al proveedor real y el backend verifica su `id_token`. El
 * emisor y el cliente público son **hechos del dueño** (`plan-ciclo-4c` §14) y llegan con el
 * despliegue; mientras estén vacíos la acción `Vincular cuenta` responde `oauth_not_configured` en
 * vez de redirigir a un emisor inventado. El URI de vuelta que hay que registrar en el proveedor es
 * `https://<este origen>/auth/callback`.
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
    issuer: '',
    clientId: '',
  },
};
