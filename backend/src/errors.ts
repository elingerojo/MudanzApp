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
  item_photo_missing: {
    code: 'item_photo_missing',
    status: 409,
    message: 'Item has no photo yet',
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
  database_not_configured: {
    code: 'database_not_configured',
    status: 503,
    message: 'Database is not configured',
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
