import { oauthRedirectUri as sharedOAuthRedirectUri } from '@mudanzapp/shared';

/**
 * Configuración compilada de la identidad de cuenta (ciclo 4c-1, `oauth-login`).
 *
 * El navegador **no** lee `process.env` (`stack` §5): el emisor y el cliente público entran al bundle
 * desde `src/environments`, y el modo se intercambia con `fileReplacements` en la configuración de
 * producción. `live` exige emisor y cliente; una cadena vacía cuenta como ausente y el flujo falla con
 * un código estable en vez de intentar una redirección incompleta.
 *
 * La forma y la comprobación viven en `shared` desde 4d, porque `shop` necesita exactamente el mismo
 * contrato. Aquí solo se conserva la derivación del URI de vuelta desde el origen del navegador.
 */
export type { OAuthClientConfig, OAuthClientMode } from '@mudanzapp/shared';
export { oauthConfigured } from '@mudanzapp/shared';

/**
 * URI de vuelta del proveedor: el origen desde el que corre la aplicación más la ruta pública del
 * callback. Se deriva del navegador y no del bundle para que no pueda quedar desfasada entre el
 * dominio desplegado y el valor compilado; el proveedor exige que esté registrada tal cual.
 */
export function oauthRedirectUri(): string {
  return sharedOAuthRedirectUri(globalThis.location.origin);
}
