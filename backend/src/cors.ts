import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * CORS mínimo del humo.
 *
 * La allowlist es **aditiva** y viene de la configuración tipada (`APP_BASE_URL`), nunca de
 * `process.env`: en desarrollo el frontend usa el proxy `/api` y no hay CORS; en producción cada
 * frontend aporta su origen, separados por comas. La barra final se normaliza en ambos lados.
 */
const ALLOW_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const ALLOW_HEADERS = 'Content-Type, Authorization';
const MAX_AGE_SECONDS = '86400';

export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function parseAllowedOrigins(appBaseUrl: string): ReadonlySet<string> {
  const origins = appBaseUrl
    .split(',')
    .map(normalizeOrigin)
    .filter((origin) => origin.length > 0);

  return new Set(origins);
}

export function createCors(appBaseUrl: string): RequestHandler {
  const allowedOrigins = parseAllowedOrigins(appBaseUrl);

  return (request: Request, response: Response, next: NextFunction): void => {
    const { origin } = request.headers;
    if (typeof origin === 'string' && allowedOrigins.has(normalizeOrigin(origin))) {
      response.setHeader('Access-Control-Allow-Origin', normalizeOrigin(origin));
      response.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS);
      response.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
      response.setHeader('Access-Control-Max-Age', MAX_AGE_SECONDS);
      response.setHeader('Vary', 'Origin');
    }

    // El preflight no lleva cuerpo y no debe pasar por el parser de JSON.
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }

    next();
  };
}
