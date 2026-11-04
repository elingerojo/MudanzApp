import { OAuthFlowError } from '@mudanzapp/shared';

import {
  OAUTH_INVALID_TOKEN,
  OAUTH_NOT_CONFIGURED,
  SESSION_REVOKED,
  UNAUTHORIZED,
  shopApiErrorCode,
} from './shop-api-error';

/**
 * Traduce el fallo del acceso a la tienda a una frase (ciclo 4d).
 *
 * Se ramifica por **código**, nunca por el mensaje ni por el estado HTTP: el código puede venir del
 * flujo —que no habla HTTP— o del borde (`{ "error": "<código>" }`). Un fallo sin código no inventa una
 * causa: muestra la frase genérica.
 */
export function shopAccountFailureMessage(failure: unknown): string {
  const code = failure instanceof OAuthFlowError ? failure.code : shopApiErrorCode(failure);

  switch (code) {
    case OAUTH_NOT_CONFIGURED:
      return 'El acceso con cuenta todavía no está configurado en esta instalación.';
    case 'oauth_denied':
      return 'El proveedor no autorizó el acceso. Inténtalo de nuevo.';
    case 'oauth_state_mismatch':
      return 'La vuelta del proveedor no corresponde a esta visita. Empieza otra vez.';
    case 'oauth_unavailable':
      return 'No se pudo hablar con el proveedor de identidad. Inténtalo de nuevo.';
    case OAUTH_INVALID_TOKEN:
      return 'El proveedor devolvió una identidad que no se pudo verificar.';
    case SESSION_REVOKED:
    case UNAUTHORIZED:
      return 'Tu sesión de la tienda ya no sirve: entra otra vez.';
    default:
      return 'No se pudo completar el acceso. Inténtalo de nuevo.';
  }
}
