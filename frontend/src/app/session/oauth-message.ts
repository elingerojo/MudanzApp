import {
  ACCOUNT_NOT_LINKED,
  OAUTH_INVALID_TOKEN,
  OAUTH_NOT_CONFIGURED,
  SESSION_NOT_CLAIMABLE,
  SESSION_REVOKED,
  UNAUTHORIZED,
  apiErrorCode,
} from './api-error';
import { OAuthFlowError } from './oauth-flow';

/**
 * Traduce el fallo de la vinculación de cuenta a una frase (ciclo 4c-1).
 *
 * Se ramifica por **código**, nunca por el mensaje ni por el estado HTTP (`stack` §9): el código puede
 * venir del flujo (que no habla HTTP) o del borde (`{ "error": "<código>" }`). Un fallo sin código no
 * inventa una causa: muestra la frase genérica.
 */
export function oauthFailureMessage(failure: unknown): string {
  const code = failure instanceof OAuthFlowError ? failure.code : apiErrorCode(failure);

  switch (code) {
    case OAUTH_NOT_CONFIGURED:
      return 'La vinculación con cuenta todavía no está configurada en esta instalación.';
    case 'oauth_denied':
      return 'El proveedor no autorizó la vinculación. Inténtalo de nuevo.';
    case 'oauth_state_mismatch':
      return 'La vuelta del proveedor no corresponde a esta visita. Empieza otra vez.';
    case 'oauth_unavailable':
      return 'No se pudo hablar con el proveedor de identidad. Inténtalo de nuevo.';
    case OAUTH_INVALID_TOKEN:
      return 'El proveedor devolvió una identidad que no se pudo verificar.';
    case SESSION_NOT_CLAIMABLE:
      return 'Este dispositivo ya tiene una cuenta vinculada.';
    case ACCOUNT_NOT_LINKED:
      return 'Esta cuenta todavía no tiene ningún evento. Entra con el enlace de invitación.';
    case SESSION_REVOKED:
    case UNAUTHORIZED:
      return 'La sesión de este dispositivo ya no sirve: entra otra vez con un enlace.';
    default:
      return 'No se pudo vincular la cuenta. Inténtalo de nuevo.';
  }
}
