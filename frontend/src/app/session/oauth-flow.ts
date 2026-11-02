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

/**
 * Para qué se abrió el flujo (ciclo 4c-1c). Es el único dato de producto que cruza esta costura:
 *
 * - `claim` — un dispositivo con sesión de evento vincula su cuenta; el backend lo canjea con
 *   `POST /auth/claim`, que exige esa sesión.
 * - `signin` — un dispositivo sin credencial vuelve a entrar con una cuenta ya vinculada; el backend
 *   lo canjea con `POST /auth/sessions`, que no exige nada más que la identidad.
 *
 * Sin este dato el callback tendría que adivinar por el estado de la sesión, y un dispositivo con una
 * credencial revocada adivinaría mal.
 */
export type OAuthPurpose = 'claim' | 'signin';

export interface OAuthResult {
  readonly idToken: string;
  readonly purpose: OAuthPurpose;
}

export interface OAuthFlow {
  /** Arranca el flujo: guarda el verificador, el `state` y el propósito, y lleva al proveedor. */
  begin(purpose: OAuthPurpose): Promise<void>;

  /** Completa la vuelta y devuelve el `id_token` junto al propósito con el que se abrió. */
  complete(params: OAuthCallbackParams): Promise<OAuthResult>;
}

export const OAUTH_FLOW = new InjectionToken<OAuthFlow>('OAUTH_FLOW');
