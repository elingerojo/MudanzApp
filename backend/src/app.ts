import type { Health } from '@mudanzapp/shared';
import express, { type Express } from 'express';

import { createCors } from './cors.js';
import type { Database } from './db.js';
import { handleErrors } from './error-handler.js';
import type { OAuthVerifier } from './identity/oauth.js';
import { createAdminRouter } from './routes/admin-router.js';
import { createAuthRouter } from './routes/auth-router.js';
import type { IdentityDeps } from './routes/dependencies.js';
import { createEventsRouter } from './routes/events-router.js';

/** El bootstrap inyecta las dependencias; las pruebas pasan dobles deterministas. */
export interface AppDependencies {
  readonly database: Database;
  readonly appBaseUrl: string;
  readonly oauth: OAuthVerifier;
  readonly adminToken: string | null;
  readonly now: () => Date;
}

export function createApp({
  database,
  appBaseUrl,
  oauth,
  adminToken,
  now,
}: AppDependencies): Express {
  const app = express();
  const identity: IdentityDeps = { database, oauth, now, adminToken };

  // 1. CORS primero: las cabeceras tienen que estar también en /health y /health/db.
  //    La allowlist viene de la configuración tipada; este archivo nunca lee process.env.
  app.use(createCors(appBaseUrl));

  // 2. JSON después de CORS: el preflight no lleva cuerpo y no debe pasar por el parser.
  app.use(express.json());

  // 3. Liveness: nunca 5xx. Una base caída no debe reiniciar un proceso sano; el estado
  //    de la dependencia va en el payload.
  app.get('/health', async (_request, response) => {
    const state = await database.check();
    const payload: Health = { status: 'ok', database: state };
    response.json(payload);
  });

  // 4. Readiness del dependiente: aquí un 5xx sí es significativo.
  app.get('/health/db', async (_request, response) => {
    const state = await database.check();
    const payload: Health =
      state === 'ok' ? { status: 'ok', database: state } : { status: 'degraded', database: state };

    response.status(state === 'ok' ? 200 : 503).json(payload);
  });

  // 5. Identidad del ciclo 1: canje, sesión por dispositivo y administración.
  app.use(createAuthRouter(identity));
  app.use(createEventsRouter(identity));
  app.use('/admin', createAdminRouter(identity));

  // 6. Último: captura el AppError de cualquier ruta.
  app.use(handleErrors);

  return app;
}
