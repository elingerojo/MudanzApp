import { defineConfig } from '@playwright/test';

import {
  BACKEND_URL,
  backendEnv,
  FRONTENDS,
  frontendUrl,
  WORKSPACE_DIRECTORY,
} from './support/harness.js';

/**
 * Config única del arnés, fuera de `workspaces` y con sus salidas junto a este archivo.
 *
 * `globalSetup` verifica el esquema sin migrar; el entorno lo inyecta `run-e2e.ts` y aquí solo se
 * aplica sobre `webServer.env`. `workers: 1` porque las suites comparten una sola base de pruebas.
 */
export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  globalSetup: './global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
  },
  // Un `project` por frontend: el humo corre una vez contra cada shell.
  projects: FRONTENDS.map((frontend) => ({
    name: frontend.name,
    use: { baseURL: frontendUrl(frontend) },
  })),
  webServer: [
    {
      command: 'npm run dev:api',
      url: `${BACKEND_URL}/health`,
      cwd: WORKSPACE_DIRECTORY,
      env: backendEnv(),
      timeout: 120_000,
      // Reusar solo puede alcanzar servidores que ya arrancaron con este entorno; el envoltorio
      // verifica los puertos antes de llegar aquí.
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    // Los frontends **no** heredan `BACKEND_ENV`: `ng serve` lee `PORT` y se quedaría con el
    // puerto del backend. Su puerto va en el comando y su configuración se compila.
    ...FRONTENDS.map((frontend) => ({
      command: frontend.command,
      url: frontendUrl(frontend),
      cwd: WORKSPACE_DIRECTORY,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe' as const,
      stderr: 'pipe' as const,
    })),
  ],
});
