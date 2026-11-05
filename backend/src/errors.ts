/**
 * Catálogo de errores del borde HTTP.
 *
 * Es el artefacto de la decisión §14.1 de `.plans/decisiones-tecnicas-app-mudanzapp.md`: códigos
 * estables, sin payload y sin detalles internos. Los códigos concretos de cada capacidad se añaden
 * al catálogo cuando esa capacidad los necesite; hoy viven los del humo y los del corte de
 * identidad (`invite`, `session`, `account-link`).
 */

export interface ErrorDefinition {
  readonly code: string;
  readonly status: number;
  readonly message: string;
}

export const ERROR_CATALOG = {
  internal_error: {
    code: 'internal_error',
    status: 500,
    message: 'Internal server error',
  },
  validation_failed: {
    code: 'validation_failed',
    status: 400,
    message: 'Request validation failed',
  },
  unauthorized: {
    code: 'unauthorized',
    status: 401,
    message: 'Authentication required',
  },
  session_revoked: {
    code: 'session_revoked',
    status: 401,
    message: 'Session revoked',
  },
  admin_unauthorized: {
    code: 'admin_unauthorized',
    status: 401,
    message: 'Admin credential required',
  },
  admin_not_configured: {
    code: 'admin_not_configured',
    status: 503,
    message: 'Admin capability is not configured',
  },
  oauth_invalid_token: {
    code: 'oauth_invalid_token',
    status: 401,
    message: 'OAuth token is not valid',
  },
  oauth_not_configured: {
    code: 'oauth_not_configured',
    status: 503,
    message: 'OAuth integration is not configured',
  },
  oauth_mode_invalid: {
    code: 'oauth_mode_invalid',
    status: 500,
    message: 'OAuth mode is not valid',
  },
  oauth_unavailable: {
    code: 'oauth_unavailable',
    status: 503,
    message: 'OAuth provider is unavailable',
  },
  account_not_linked: {
    code: 'account_not_linked',
    status: 401,
    message: 'Account is not linked to an event',
  },
  invitation_invalid: {
    code: 'invitation_invalid',
    status: 410,
    message: 'Invitation is not usable',
  },
  session_not_claimable: {
    code: 'session_not_claimable',
    status: 409,
    message: 'Session is already an account session',
  },
  item_not_found: {
    code: 'item_not_found',
    status: 404,
    message: 'Item not found',
  },
  photo_invalid: {
    code: 'photo_invalid',
    status: 400,
    message: 'Photo is not acceptable',
  },
  r2_mode_invalid: {
    code: 'r2_mode_invalid',
    status: 500,
    message: 'Storage mode is not valid',
  },
  r2_not_configured: {
    code: 'r2_not_configured',
    status: 503,
    message: 'Storage is not configured',
  },
  r2_live_unavailable: {
    code: 'r2_live_unavailable',
    status: 503,
    message: 'Storage live adapter is not available yet',
  },
  r2_unavailable: {
    code: 'r2_unavailable',
    status: 503,
    message: 'Object storage is unavailable',
  },
  ai_mode_invalid: {
    code: 'ai_mode_invalid',
    status: 500,
    message: 'AI mode is not valid',
  },
  ai_not_configured: {
    code: 'ai_not_configured',
    status: 503,
    message: 'AI integration is not configured',
  },
  ai_unavailable: {
    code: 'ai_unavailable',
    status: 503,
    message: 'AI provider is unavailable',
  },
  ai_output_invalid: {
    code: 'ai_output_invalid',
    status: 502,
    message: 'AI output did not match the contract',
  },
  listing_photo_required: {
    code: 'listing_photo_required',
    status: 409,
    message: 'A listing requires a photo',
  },
  listing_not_published: {
    code: 'listing_not_published',
    status: 409,
    message: 'The item is not published',
  },
  /**
   * Un artículo vendido no se borra (ciclo 4c-4, decisión §40): `sold_at` es la evidencia de la
   * venta y `delete` no es la forma de cerrarla. La limpieza, si llega, es su propio ciclo.
   */
  item_sold: {
    code: 'item_sold',
    status: 409,
    message: 'A sold item is evidence and cannot be deleted',
  },
  listing_gone: {
    code: 'listing_gone',
    status: 410,
    message: 'The listing is no longer available',
  },
  /**
   * Un artículo sin precio no se puede pedir (ciclo 4b §35; su primer escritor es la solicitud del
   * carrito, ciclo 4e): el comprador no puede aceptar un importe que no conoce.
   */
  price_missing: {
    code: 'price_missing',
    status: 409,
    message: 'The item has no price',
  },
  /** El carrito no tiene artículos: no hay nada que pedir. */
  cart_empty: {
    code: 'cart_empty',
    status: 409,
    message: 'The cart has no items',
  },
  /** El evento no configuró su WhatsApp, así que nadie recibiría el mensaje (decisión §44). */
  whatsapp_not_configured: {
    code: 'whatsapp_not_configured',
    status: 409,
    message: 'The event has no WhatsApp contact',
  },
  /** Un artículo del carrito se vendió: la solicitud no se emite con algo que ya no está. */
  listing_sold: {
    code: 'listing_sold',
    status: 409,
    message: 'A listing in the cart is sold',
  },
  database_not_configured: {
    code: 'database_not_configured',
    status: 503,
    message: 'Database is not configured',
  },
  forbidden: {
    code: 'forbidden',
    status: 403,
    message: 'The session may not administer this event',
  },
  not_found: {
    code: 'not_found',
    status: 404,
    message: 'Resource not found',
  },
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export const INTERNAL_ERROR = ERROR_CATALOG.internal_error;
export const VALIDATION_FAILED = ERROR_CATALOG.validation_failed;

/** Error controlado: lo único que cruza el borde es su código estable y su estado HTTP. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode) {
    const definition = ERROR_CATALOG[code];
    super(definition.message);
    this.name = 'AppError';
    this.code = code;
    this.status = definition.status;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
