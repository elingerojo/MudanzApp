/**
 * Fallo del flujo de identidad del navegador (ciclos 4c-1 y 4d).
 *
 * Vive en `shared` porque los dos frontends públicos lo consumen: `frontend` con los propósitos
 * `claim` y `signin`, y `shop` con `shop`. Los códigos son estables y no describen HTTP: el flujo del
 * navegador no habla con el proveedor en el canje, y el borde traduce los suyos por separado.
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
