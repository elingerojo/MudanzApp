import type { ErrorRequestHandler, Request } from 'express';
import { ZodError } from 'zod';

import { AppError, INTERNAL_ERROR, VALIDATION_FAILED, isAppError } from './errors.js';
import { OAuthError } from './identity/oauth.js';

/**
 * Último middleware del orden del humo.
 *
 * Traduce cualquier error a un código estable. Ni el mensaje ni el payload original cruzan el
 * borde: un `ZodError` se reporta como `validation_failed` y lo no controlado, como `internal_error`.
 *
 * Desde el ciclo de diagnóstico del borde (2026-11-04) un fallo del **servidor** deja además evidencia
 * en la consola: código estable, nombre del error, su código de causa —`SQLSTATE` de Postgres o `errno`
 * de Node— y la ruta **declarada** de la petición. Es lo que `05` §3 pide para poder reproducirlo sin
 * filtrar secretos: no se registra el mensaje, ni el cuerpo, ni los valores de los parámetros.
 *
 * Un `400`, un `401` o un `403` no se registran: son refusos esperados, y anotarlos convertiría la
 * negativa del rey en ruido que esconde el fallo que sí importa.
 */
export const handleErrors: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  let appError: AppError;
  if (isAppError(error)) {
    appError = error;
  } else if (error instanceof ZodError) {
    appError = new AppError(VALIDATION_FAILED.code);
  } else if (error instanceof OAuthError) {
    // El fallo de la integración conserva su código estable; el detalle queda en la evidencia.
    appError = new AppError(error.code);
  } else {
    appError = new AppError(INTERNAL_ERROR.code);
  }

  if (appError.status >= 500) {
    // La causa solo se registra cuando **no** es ya el código estable del borde: un `AppError`
    // lleva su código en `code`, y repetirlo en `cause` fue un defecto que la primera corrida real
    // del registro delató (`server-error { code: 'oauth_not_configured', cause: 'oauth_not_configured' }`).
    const cause = causeCode(error);
    console.error('server-error', {
      code: appError.code,
      name: errorName(error),
      cause: cause === appError.code ? null : cause,
      method: request.method,
      route: routeOf(request),
    });
  }

  response.status(appError.status).json({ error: appError.code });
};

/**
 * El nombre del error es evidencia y no filtra datos: `TypeError`, `RangeError`, `DatabaseError`, o el
 * tipo del valor lanzado cuando ni siquiera era un error.
 */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/**
 * El código que el error trae consigo, cuando lo trae: `SQLSTATE` en un error de Postgres o `errno` en
 * uno del sistema. Es lo que separa «falta una columna» (`42P01`) de «la base no responde»
 * (`ECONNREFUSED`) sin volcar el mensaje.
 */
function causeCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const { code } = error as { readonly code?: unknown };
  return typeof code === 'string' && code.length > 0 ? code : null;
}

/**
 * La ruta **declarada** del endpoint, nunca la concreta: `/events/:eventId/dashboard` en vez de
 * `/events/9f1c…/dashboard`. Sirve para saber qué endpoint falló sin registrar identificadores.
 */
function routeOf(request: Request): string {
  const route: unknown = request.route;
  if (typeof route === 'object' && route !== null && 'path' in route) {
    const { path } = route as { readonly path?: unknown };
    if (typeof path === 'string' && path.length > 0) {
      return path;
    }
  }

  return request.path;
}
