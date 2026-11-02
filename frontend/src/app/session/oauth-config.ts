/**
 * Configuración compilada de la identidad de cuenta (ciclo 4c-1, `oauth-login`).
 *
 * El navegador **no** lee `process.env` (`stack` §5): el emisor y el cliente público entran al bundle
 * desde `src/environments`, y el modo se intercambia con `fileReplacements` en la configuración de
 * producción. `live` exige emisor y cliente; una cadena vacía cuenta como ausente y el flujo falla con
 * un código estable en vez de intentar una redirección incompleta.
 *
 * El `client_secret` no aparece aquí ni debe aparecer: el canje del código es de cliente público y el
 * backend es el único que verifica el `id_token`.
 */

export type OAuthClientMode = 'live' | 'fake';

export interface OAuthClientConfig {
  readonly mode: OAuthClientMode;
  readonly issuer: string;
  readonly clientId: string;
}

/** ¿Hay con qué iniciar el flujo? Es la comprobación que evita una redirección a medias. */
export function oauthConfigured(config: OAuthClientConfig): boolean {
  return config.issuer.trim().length > 0 && config.clientId.trim().length > 0;
}

/**
 * URI de vuelta del proveedor: el origen desde el que corre la aplicación más la ruta pública del
 * callback. Se deriva del navegador y no del bundle para que no pueda quedar desfasada entre el
 * dominio desplegado y el valor compilado; el proveedor exige que esté registrada tal cual.
 */
export function oauthRedirectUri(): string {
  return `${globalThis.location.origin}/auth/callback`;
}
