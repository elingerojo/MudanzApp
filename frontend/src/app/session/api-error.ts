import { HttpErrorResponse } from '@angular/common/http';

/**
 * Código estable del error del borde HTTP.
 *
 * El backend responde `{ "error": "<código>" }` y el cliente ramifica por ese código, nunca por el
 * mensaje ni por el estado (`stack` §9). Un error sin cuerpo se traduce a `null`: la pantalla muestra
 * entonces su mensaje genérico en vez de inventar una causa.
 */
export function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }

  const body: unknown = error.error;
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return null;
  }

  const { error: code } = body as { error?: unknown };
  return typeof code === 'string' && code.length > 0 ? code : null;
}

/** Códigos que este corte distingue en la interfaz, con nombre propio. */
export const INVITATION_INVALID = 'invitation_invalid';
/**
 * La credencial de plataforma (ciclo E1, decisión §46): no es una sesión, así que sus dos fallos
 * tienen frases propias —no se confunde con «tu sesión no sirve» ni con un fallo de red.
 */
export const ADMIN_UNAUTHORIZED = 'admin_unauthorized';
export const ADMIN_NOT_CONFIGURED = 'admin_not_configured';
export const PHOTO_INVALID = 'photo_invalid';
/** El conjunto de fotos ya no coincide con la galería (ciclo 3e): se recarga, no se repara. */
export const PHOTO_ORDER_MISMATCH = 'photo_order_mismatch';
export const ITEM_NOT_FOUND = 'item_not_found';
/** Un artículo vendido no se borra: la venta es su evidencia (ciclo 4c-4, decisión §40). */
export const ITEM_SOLD = 'item_sold';
export const LISTING_PHOTO_REQUIRED = 'listing_photo_required';
export const LISTING_NOT_PUBLISHED = 'listing_not_published';
export const LISTING_GONE = 'listing_gone';
/** El cuerpo no cumple el contrato (ciclo 4e): el WhatsApp del evento con una forma imposible. */
export const VALIDATION_FAILED = 'validation_failed';
export const SESSION_REVOKED = 'session_revoked';
export const UNAUTHORIZED = 'unauthorized';
/** La sesión no administra el evento (ciclo 4c-2): el evento se ve, el derecho no existe. */
export const FORBIDDEN = 'forbidden';
/** El evento no está a la vista de la sesión (ciclo 4c-2): no se distingue del inexistente. */
export const NOT_FOUND = 'not_found';

/**
 * Qué familia explica que el panel no se abriera (diagnóstico del borde, 2026-11-04).
 *
 * Tres hechos distintos que antes compartían una sola frase: **el borde dijo que no**, **el evento no
 * está a la vista de la sesión** y **la lectura falló**. El guard escribe la familia en la URL y el
 * marco del evento la traduce; la decisión vive aquí y en ningún otro lugar, para que el aviso no
 * invente un hecho que el código del borde no afirma.
 */
export type DashboardDenial = 'forbidden' | 'not_found' | 'unavailable';

export function dashboardDenial(code: string | null): DashboardDenial {
  if (code === FORBIDDEN) {
    return 'forbidden';
  }

  if (code === NOT_FOUND) {
    return 'not_found';
  }

  return 'unavailable';
}

/**
 * Identidad de cuenta del ciclo 4c (`oauth-login`): el reclamo exige un sujeto y el proveedor puede
 * rechazarlo. Se nombran aquí para que las dos pantallas del flujo —la Cuenta y el callback— traduzcan
 * el mismo código a la misma frase.
 */
export const OAUTH_INVALID_TOKEN = 'oauth_invalid_token';
export const OAUTH_NOT_CONFIGURED = 'oauth_not_configured';
export const SESSION_NOT_CLAIMABLE = 'session_not_claimable';
/** La cuenta existe pero no tiene ningún evento: haber entrado no es tener acceso (4c-1c). */
export const ACCOUNT_NOT_LINKED = 'account_not_linked';

/** Fallos de la integración de IA (`ai-draft`, ciclo 3d), cada uno con su mensaje en la captura. */
export const AI_UNAVAILABLE = 'ai_unavailable';
export const AI_OUTPUT_INVALID = 'ai_output_invalid';
export const AI_NOT_CONFIGURED = 'ai_not_configured';
