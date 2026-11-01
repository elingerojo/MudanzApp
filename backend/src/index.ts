import { createAiDraftProvider } from './ai/draft-provider.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { createDatabase } from './db.js';
import { createOAuthVerifier } from './identity/oauth.js';
import { createObjectStore } from './storage/object-store.js';

// El proceso —no el módulo— posee el ciclo de vida: aquí se crea el adaptador, se construye la
// app y se escucha. Ningún otro archivo llama a createDatabase ni a createOAuthVerifier.
for (const warning of config.warnings) {
  console.warn(`config-warning: ${warning}`);
}

const database = createDatabase(config.databaseUrl);
const oauth = createOAuthVerifier(config.oauth);
const storage = createObjectStore(config.storage);
// El proveedor se crea **una sola vez**, como `oauth` y `storage`. `fetch` se pasa sin atarlo a
// `globalThis` para que el adaptador se pueda probar sin red.
const ai = createAiDraftProvider(config.ai, { fetch: (input, init) => fetch(input, init) });
const app = createApp({
  database,
  appBaseUrl: config.appBaseUrl,
  oauth,
  adminToken: config.adminToken,
  now: () => new Date(),
  storage,
  ai,
});

const server = app.listen(config.port, () => {
  console.log(`backend listening on port ${String(config.port)}`);
});

// Apagado ordenado: primero se deja de aceptar peticiones, después se libera el pool. Al revés,
// las peticiones en vuelo fallarían contra un pool cerrado.
function shutdown(signal: string): void {
  console.log(`received ${signal}: shutting down`);
  server.close(() => {
    void database.close().finally(() => {
      process.exit(0);
    });
  });
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
