import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Arnés e2e: dueño del entorno de la corrida.
 *
 * El envoltorio ([`run-e2e.ts`](../run-e2e.ts)) carga `backend/.env.local` con el parser nativo de
 * Node, **deriva** la URL de pruebas y la inyecta en este proceso. Aquí solo se compone
 * `backendEnv()` —una función, no una constante— cuyo resultado la config de Playwright aplica sobre
 * cada `webServer` (plantilla §2.1 y `07` §4). Ningún valor se imprime: la base de pruebas nunca
 * viaja por la salida.
 *
 * Las integraciones se declaran en `fake`; el modo de una integración se lee solo cuando su
 * capacidad existe (`00-stack`), así que hoy son marcas deterministas para el ciclo que la cree.
 */

export interface FrontendHarness {
  readonly name: string;
  readonly port: number;
  readonly command: string;
}

const e2eDirectory = dirname(fileURLToPath(import.meta.url));

/** Raíz del monorepo: los `webServer` corren desde aquí, no desde `e2e/`. */
export const WORKSPACE_DIRECTORY = join(e2eDirectory, '..', '..');

export const BACKEND_PORT = 3000;
export const BACKEND_URL = `http://localhost:${String(BACKEND_PORT)}`;

/**
 * Un `project` por frontend, con su propio `ng serve`. El puerto es siempre **explícito**: `ng
 * serve` honra la variable `PORT`, así que heredar el entorno del backend lo haría competir por
 * `3000` (medido en la primera corrida real). El resto de los frontends usa `4201` (manual
 * `Man-2.5`).
 */
export const FRONTENDS: readonly FrontendHarness[] = [
  { name: 'frontend', port: 4200, command: 'npm run dev -w frontend -- --port 4200' },
  { name: 'wiki', port: 4201, command: 'npm run dev -w wiki -- --port 4201' },
];

/** Puertos que el arnés posee: si alguno escucha, la corrida es un fallo del operador (`07` §4). */
export const HARNESS_PORTS: readonly number[] = [BACKEND_PORT, ...FRONTENDS.map((fe) => fe.port)];

export function frontendUrl(frontend: FrontendHarness): string {
  return `http://localhost:${String(frontend.port)}`;
}

/**
 * URL derivada de la base de pruebas, inyectada por el envoltorio.
 *
 * La guarda evita el error caro: `npx playwright test` a mano apuntaría el arnés a la base de
 * desarrollo, así que la corrida se rechaza con un código estable en vez de degradar en silencio.
 */
export function testDatabaseUrl(): string {
  if (process.env.MUDANZAPP_E2E !== '1') {
    throw new Error(
      'e2e-wrapper-required: run npm run test:e2e or npm run test:e2e:branch; a bare npx playwright test would point the harness at the development database',
    );
  }

  const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
  if (databaseUrl.length === 0) {
    throw new Error(
      'e2e-database-url-missing: the wrapper did not inject the derived test database',
    );
  }

  return databaseUrl;
}

/** Objetivo derivado por el envoltorio: decide qué migración manual es el postrequisito. */
export function migrateCommand(): string {
  return process.env.MUDANZAPP_E2E_TARGET === 'branch-test'
    ? 'npm run db:migrate:branch:test'
    : 'npm run db:migrate:test';
}

/**
 * Entorno del backend del arnés: base de pruebas, un origen por frontend e integraciones en
 * `fake`. Se compone **una sola vez** por corrida y se aplica sobre `webServer.env`.
 */
export function backendEnv(): Record<string, string> {
  return {
    DATABASE_URL: testDatabaseUrl(),
    PORT: String(BACKEND_PORT),
    NODE_ENV: 'test',
    // Allowlist de CORS: un origen por frontend, normalizados sin barra final (`cors.ts`).
    APP_BASE_URL: FRONTENDS.map((frontend) => frontendUrl(frontend)).join(','),
    APP_MODE: 'fake',
    R2_MODE: 'fake',
    AI_MODE: 'fake',
  };
}
