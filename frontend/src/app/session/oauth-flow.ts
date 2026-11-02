import { InjectionToken } from '@angular/core';

/**
 * Flujo de identidad de cuenta del ciclo 4c-1 (`oauth-login`, decisión §37).
 *
 * La costura (`OAuthFlow`) separa «pedir identidad al proveedor» de «canjearla por una sesión del
 * backend». Dos implementaciones la consumen y ninguna otra toca PKCE:
 *
 * - `LiveOAuthFlow` habla con el emisor real: descubre sus endpoints, redirige con el `challenge` y
 *   canjea el código por un `id_token`.
 * - `FakeOAuthFlow` es el doble determinista: no sale del navegador y devuelve un token fijo, de modo
 *   que el arnés e2e no depende de ninguna API real (`stack` §9). Se elige por configuración
 *   compilada, nunca por una variable de entorno del navegador.
 *
 * El token que sale de aquí es la **entrada** de `POST /auth/claim`; la sesión la emite el backend y
 * este módulo no la guarda.
 */

/** Parámetros con los que el proveedor devuelve el control a `/auth/callback`. */
export interface OAuthCallbackParams {
  readonly code: string | null;
  readonly state: string | null;
  /** El proveedor deniega con `?error=`; es un rechazo explícito, no una visita fallida. */
  readonly error: string | null;
}

/**
 * Códigos estables del flujo. `oauth_not_configured` y `oauth_invalid_token` coinciden con los del
 * catálogo del backend para que la pantalla traduzca una sola vez.
 */
export type OAuthFlowErrorCode =
  | 'oauth_not_configured'
  | 'oauth_state_mismatch'
  | 'oauth_unavailable'
  | 'oauth_invalid_token'
  | 'oauth_denied';

export class OAuthFlowError extends Error {
  readonly code: OAuthFlowErrorCode;

  constructor(code: OAuthFlowErrorCode) {
    super(code);
    this.name = 'OAuthFlowError';
    this.code = code;
  }
}

export interface OAuthFlow {
  /** Arranca el flujo: guarda el verificador y el `state`, y lleva al proveedor. */
  begin(): Promise<void>;

  /** Completa la vuelta y devuelve el `id_token` que se entrega al backend. */
  complete(params: OAuthCallbackParams): Promise<string>;
}

export const OAUTH_FLOW = new InjectionToken<OAuthFlow>('OAUTH_FLOW');
