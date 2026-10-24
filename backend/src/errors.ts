/**
 * Catálogo de errores del borde HTTP.
 *
 * Es la pre-decisión §14.1 de `.plans/decisiones-tecnicas-app-mudanzapp.md`: códigos estables, sin
 * payload y sin detalles internos. Los códigos concretos de cada capacidad se añaden al catálogo
 * cuando esa capacidad los necesite; aquí solo viven los del humo.
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
