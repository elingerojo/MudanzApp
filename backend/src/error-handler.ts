import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError, INTERNAL_ERROR, VALIDATION_FAILED, isAppError } from './errors.js';

/**
 * Último middleware del orden del humo.
 *
 * Traduce cualquier error a un código estable. Ni el mensaje ni el payload original cruzan el
 * borde: un `ZodError` se reporta como `validation_failed` y lo no controlado, como
 * `internal_error`, con una traza de consola que no contiene valores de entorno.
 */
export const handleErrors: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  let appError: AppError;
  if (isAppError(error)) {
    appError = error;
  } else if (error instanceof ZodError) {
    appError = new AppError(VALIDATION_FAILED.code);
  } else {
    console.error('unhandled-error');
    appError = new AppError(INTERNAL_ERROR.code);
  }

  response.status(appError.status).json({ error: appError.code });
};
