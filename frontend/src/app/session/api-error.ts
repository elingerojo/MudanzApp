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
export const PHOTO_INVALID = 'photo_invalid';
export const ITEM_NOT_FOUND = 'item_not_found';
export const LISTING_PHOTO_REQUIRED = 'listing_photo_required';
export const LISTING_NOT_PUBLISHED = 'listing_not_published';
export const LISTING_GONE = 'listing_gone';
export const SESSION_REVOKED = 'session_revoked';
export const UNAUTHORIZED = 'unauthorized';

/** Fallos de la integración de IA (`ai-draft`, ciclo 3d), cada uno con su mensaje en la captura. */
export const AI_UNAVAILABLE = 'ai_unavailable';
export const AI_OUTPUT_INVALID = 'ai_output_invalid';
export const AI_NOT_CONFIGURED = 'ai_not_configured';
