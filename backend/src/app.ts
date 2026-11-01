import type { Health } from '@mudanzapp/shared';
import express, { type Express } from 'express';

import type { AiDraftProvider } from './ai/draft-provider.js';
import { createCors } from './cors.js';
import type { Database } from './db.js';
import { handleErrors } from './error-handler.js';
import type { OAuthVerifier } from './identity/oauth.js';
import { createAdminRouter } from './routes/admin-router.js';
import { createAiRouter } from './routes/ai-router.js';
import { createAuthRouter } from './routes/auth-router.js';
import type { IdentityDeps } from './routes/dependencies.js';
import { createEventsRouter } from './routes/events-router.js';
import { createItemsRouter } from './routes/items-router.js';
import { createListingsRouter, createPublicListingsRouter } from './routes/listings-router.js';
import type { ObjectStore } from './storage/object-store.js';

/** El bootstrap inyecta las dependencias; las pruebas pasan dobles deterministas. */
export interface AppDependencies {
  readonly database: Database;
  readonly appBaseUrl: string;
  readonly oauth: OAuthVerifier;
  readonly adminToken: string | null;
  readonly now: () => Date;
  readonly storage: ObjectStore;
  readonly ai: AiDraftProvider;
}

export function createApp({
  database,
  appBaseUrl,
  oauth,
  adminToken,
  now,
  storage,
  ai,
}: AppDependencies): Express {
  const app = express();
  const identity: IdentityDeps = { database, oauth, now, adminToken, storage, ai };

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

  // 5. Ficha pública del ciclo 3c (`publish`): sin credencial y montada antes de los routers con
  //    middleware de sesión, para que el enlace compartido no dependa de ningún estado de sesión.
  app.use(createPublicListingsRouter(identity));

  // 6. Identidad del ciclo 1: canje, sesión por dispositivo y administración.
  app.use(createAuthRouter(identity));
  app.use(createEventsRouter(identity));

  // 7. Artículos y fotos del ciclo 3a (`capture`) y su revisión con `PATCH` (ciclo 3d).
  app.use(createItemsRouter(identity));

  // 7.b Borrador de la ficha con IA (`ai-draft`, ciclo 3d): lee y no escribe.
  app.use(createAiRouter(identity));

  // 8. Publicación con sesión del evento (`publish`, ciclo 3c).
  app.use(createListingsRouter(identity));

  app.use('/admin', createAdminRouter(identity));

  // 9. Último: captura el AppError de cualquier ruta.
  app.use(handleErrors);

  return app;
}
