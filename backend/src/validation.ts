import type { ZodType } from 'zod';

import { AppError, VALIDATION_FAILED } from './errors.js';

/**
 * Frontera de validación HTTP.
 *
 * El detalle del fallo no cruza el borde: el cliente recibe el código estable
 * `validation_failed`, mientras el error de `zod` queda dentro del proceso para la evidencia.
 *
 * Es la costura por la que entran los esquemas exportados por `shared`; el corte de identidad la
 * usa en `POST /auth/redeem`, `POST /auth/sessions` y las rutas de administración.
 */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(VALIDATION_FAILED.code);
  }

  return result.data;
}
