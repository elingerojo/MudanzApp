import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Guarda contra el origen duplicado del backend (ciclo 4a, `plan-ciclo-4a` §10).
 *
 * El Worker de `shop` necesita `API_BASE_URL` en runtime y la SPA la compila en
 * `environment.production.ts`. Wrangler no lee TypeScript, así que el valor se escribe en los dos
 * archivos; esta prueba falla si dejan de coincidir, que es el disparador declarado («el primer
 * despliegue en el que la página pública apunte a un origen distinto que la SPA»).
 *
 * Vive en la suite del backend porque es el workspace con `node:fs` tipado y corre en el gate por
 * defecto; no toca la base ni la red.
 */
function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function originOf(source: string, pattern: RegExp): string | null {
  return pattern.exec(source)?.[1] ?? null;
}

describe('shop worker backend origin', () => {
  it('matches the origin compiled into the public frontend', () => {
    const workerOrigin = originOf(
      read('../../../shop/wrangler.jsonc'),
      /"API_BASE_URL":\s*"([^"]+)"/,
    );
    const compiledOrigin = originOf(
      read('../../../shop/src/environments/environment.production.ts'),
      /apiBaseUrl:\s*'([^']+)'/,
    );

    expect(workerOrigin).not.toBeNull();
    expect(compiledOrigin).not.toBeNull();
    expect(workerOrigin).toBe(compiledOrigin);
  });

  it('declares an https origin without a trailing slash', () => {
    const workerOrigin =
      originOf(read('../../../shop/wrangler.jsonc'), /"API_BASE_URL":\s*"([^"]+)"/) ?? '';

    expect(workerOrigin.startsWith('https://')).toBe(true);
    expect(workerOrigin.endsWith('/')).toBe(false);
  });
});
