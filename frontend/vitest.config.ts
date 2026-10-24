import { defineConfig } from 'vitest/config';

/**
 * Configuración de Vitest del workspace.
 *
 * `globals` y `pool: 'threads'` son contrato de la plantilla §2.1: las specs no importan
 * `describe`/`it`/`expect` y `forks` no cabe en el presupuesto de arranque. El builder
 * `@angular/build:unit-test` la consume por `runnerConfig` y aporta el entorno y el setup.
 */
export default defineConfig({
  test: {
    globals: true,
    pool: 'threads',
  },
});
