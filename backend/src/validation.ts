import type { ZodType } from 'zod';

import { AppError, VALIDATION_FAILED } from './errors.js';

/**
 * Frontera de validación HTTP.
 *
 * El detalle del fallo no cruza el borde: el cliente recibe el código estable
 * `validation_failed`, mientras el error de `zod` queda dentro del proceso para la evidencia.
 */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(VALIDATION_FAILED.code);
  }

  return result.data;
}
