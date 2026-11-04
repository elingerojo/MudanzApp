import type { OAuthClientConfig } from '@mudanzapp/shared';

/**
 * Producción: el valor se compila dentro del bundle y `fileReplacements` lo intercambia solo en
 * la configuración `production`.
 *
 * El origen es el dominio público del backend en Railway (manual `Man-3.4`), sin barra final:
 * cada consumidor le añade su propia ruta (`${apiBaseUrl}/health` en el humo de estado).
 *
 * `oauth` entra en `live` con el mismo emisor y cliente público que compila `frontend`; ninguno es un
 * secreto. El URI de vuelta se deriva del origen del navegador, así que este despliegue exige tener
 * registrado `<origen-de-shop>/auth/callback` en el proveedor además del de `frontend`; sin ese
 * registro el flujo responde `redirect_uri_mismatch`.
 */
export const environment: {
  readonly apiBaseUrl: string;
  readonly oauth: OAuthClientConfig;
} = {
  apiBaseUrl: 'https://mudanzappbackend-production.up.railway.app',
  oauth: {
    mode: 'live',
    issuer: 'https://accounts.google.com',
    clientId: '415847053935-mf9kh5irtpllqva963vms94jat6iigo5.apps.googleusercontent.com',
  },
};
