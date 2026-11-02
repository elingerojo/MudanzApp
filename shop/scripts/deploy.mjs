import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Despliegue manual del Worker de `shop` (ciclo 4a, `event-index`).
 *
 * Es el fallback del dueño cuando no se usa la integración de Workers Builds: corre `wrangler deploy`
 * con el `wrangler.jsonc` del workspace, desde su directorio, para que el `assets.directory` y el
 * `main` se resuelvan igual que en el dashboard.
 *
 * `API_BASE_URL` vive en `wrangler.jsonc` y su coincidencia con `environment.production.ts` la
 * verifica `src/worker-config.spec.ts`: aquí no se transporta ningún valor.
 */
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const shopDirectory = join(scriptDirectory, '..');
const wrangler = join(shopDirectory, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const child = spawn(
  process.execPath,
  [wrangler, 'deploy', '-c', join(shopDirectory, 'wrangler.jsonc')],
  {
    cwd: shopDirectory,
    stdio: 'inherit',
  },
);

child.on('error', () => {
  console.error('wrangler-spawn-failed');
  process.exit(1);
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal === null ? 0 : 1));
});
