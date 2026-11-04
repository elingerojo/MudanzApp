import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { handleErrors } from '../src/error-handler.js';
import { AppError } from '../src/errors.js';

/**
 * La evidencia de un fallo del borde (diagnóstico de 2026-11-04, `05` §3).
 *
 * El defecto que cierra: un `500` solo dejaba `unhandled-error` en la consola, sin operación, sin
 * error y sin causa, así que el fallo no se podía reproducir. Desde este corte se registra el código
 * estable, el nombre del error, su código de causa y la ruta **declarada** — y nada más: la prueba
 * fija el conjunto exacto de claves para que un campo nuevo obligue a decidir si filtra o no.
 *
 * La otra mitad del contrato: un refuso esperado (`400`, `401`, `403`) **no** se registra, porque el
 * ruido esconde el fallo que sí importa. Los nombres de prueba, hooks y espías salen de los globales
 * del proyecto (`vitest.config.ts` → `globals`), igual que el resto de la suite del backend.
 */
const EVIDENCE_KEYS = ['code', 'name', 'cause', 'method', 'route'];

interface Shot {
  readonly status: number;
  readonly body: unknown;
}

let logged: (readonly unknown[])[] = [];

function shoot(
  error: unknown,
  overrides: { readonly route?: unknown; readonly path?: string; readonly method?: string } = {},
): Shot {
  let status = 0;
  let body: unknown = null;
  const json = (payload: unknown): void => {
    body = payload;
  };
  const response = {
    headersSent: false,
    status: (value: number) => {
      status = value;
      return { json };
    },
  } as unknown as Response;

  const request = {
    method: overrides.method ?? 'GET',
    path: overrides.path ?? '/events/9f1c0e4a-0000-4000-8000-000000000000/dashboard',
    // `'route' in overrides` y no `??`: una prueba necesita modelar «ninguna ruta hizo match», y eso
    // es `null`, no un valor ausente que caería en el valor por defecto.
    route: 'route' in overrides ? overrides.route : { path: '/events/:eventId/dashboard' },
  } as unknown as Request;

  handleErrors(error, request, response, (() => undefined) as NextFunction);

  return { status, body };
}

describe('handleErrors evidence', () => {
  beforeEach(() => {
    logged = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs an unexpected error with its code, its name and the declared route', () => {
    const shot = shoot(new TypeError('x is not a function'));

    expect(shot.status).toBe(500);
    expect(shot.body).toEqual({ error: 'internal_error' });
    expect(logged).toHaveLength(1);

    const [title, evidence] = logged[0] as [string, Record<string, unknown>];
    expect(title).toBe('server-error');
    expect(evidence).toEqual({
      code: 'internal_error',
      name: 'TypeError',
      cause: null,
      method: 'GET',
      route: '/events/:eventId/dashboard',
    });

    // Ni el mensaje ni el payload viajan: solo las cinco claves decididas.
    expect(Object.keys(evidence).sort()).toEqual([...EVIDENCE_KEYS].sort());
  });

  it('keeps the cause code of a database error, which separates a bad schema from a dead host', () => {
    const failure = Object.assign(new Error('relation does not exist'), { code: '42P01' });

    shoot(failure, {
      method: 'DELETE',
      route: { path: '/events/:eventId/invitations/:invitationId' },
    });

    const [, evidence] = logged[0] as [string, Record<string, unknown>];
    expect(evidence).toMatchObject({ code: 'internal_error', cause: '42P01', method: 'DELETE' });
  });

  it('does not repeat the stable code as a cause when the error is a controlled one', () => {
    const shot = shoot(new AppError('oauth_not_configured'));

    expect(shot.status).toBe(503);
    const [, evidence] = logged[0] as [string, Record<string, unknown>];
    expect(evidence).toMatchObject({ code: 'oauth_not_configured', name: 'AppError', cause: null });
  });

  it('falls back to the request path when no route was matched', () => {
    shoot(new Error('boom'), { route: null, path: '/sin-ruta' });

    const [, evidence] = logged[0] as [string, Record<string, unknown>];
    expect(evidence.route).toBe('/sin-ruta');
  });

  it('stays quiet for an expected refusal, which is not an incident', () => {
    const forbidden = shoot(new AppError('forbidden'));
    const notFound = shoot(new AppError('not_found'));
    const validation = shoot(new ZodError([]));

    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: 'forbidden' });
    expect(notFound.status).toBe(404);
    expect(validation.status).toBe(400);
    expect(logged).toHaveLength(0);
  });
});
