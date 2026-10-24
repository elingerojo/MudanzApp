import { createApp } from './app.js';
import { config } from './config.js';
import { createDatabase } from './db.js';

// El proceso —no el módulo— posee el ciclo de vida: aquí se crea el adaptador, se construye la
// app y se escucha. Ningún otro archivo llama a createDatabase.
for (const warning of config.warnings) {
  console.warn(`config-warning: ${warning}`);
}

const database = createDatabase(config.databaseUrl);
const app = createApp({ database, appBaseUrl: config.appBaseUrl });

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
