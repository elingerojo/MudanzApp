import { HttpErrorResponse } from '@angular/common/http';

/**
 * Código estable del error del borde HTTP para la tienda (ciclo 4d).
 *
 * El backend responde `{ "error": "<código>" }` y el cliente ramifica por ese código, nunca por el
 * mensaje ni por el estado (`stack` §9). Un error sin cuerpo se traduce a `null`: la pantalla muestra
 * entonces su mensaje genérico en vez de inventar una causa.
 */
export function shopApiErrorCode(error: unknown): string | null {
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

export const SESSION_REVOKED = 'session_revoked';
export const UNAUTHORIZED = 'unauthorized';
export const OAUTH_INVALID_TOKEN = 'oauth_invalid_token';
export const OAUTH_NOT_CONFIGURED = 'oauth_not_configured';

/** Los códigos del carrito y de su solicitud (ciclo 4e), cada uno con su frase en la tienda. */
export const CART_EMPTY = 'cart_empty';
export const WHATSAPP_NOT_CONFIGURED = 'whatsapp_not_configured';
export const PRICE_MISSING = 'price_missing';
export const LISTING_SOLD = 'listing_sold';
/** La ficha fue retirada del catálogo (F3): la URL y el carrito ya no la ofrecen. */
export const LISTING_UNPUBLISHED = 'listing_unpublished';
export const LISTING_NOT_PUBLISHED = 'listing_not_published';
