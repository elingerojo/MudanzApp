// Única configuración de ESLint del monorepo (plantilla §2.1).
// Pasada única desde la raíz: `eslint .` cubre la raíz, `.scripts/`, cada workspace y `e2e/`.
// Las reglas de Angular se añaden en la Fase 5, cuando exista el código que las consume.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.angular/**',
      '**/coverage/**',
      'playwright-report/**',
      'blob-report/**',
      'test-results/**',
      '**/.vitest/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // JavaScript propio (scripts de la raíz y del workspace): globals de Node explícitos.
    // En `.ts` el chequeo de globals lo hace TypeScript, por eso `no-undef` no aplica ahí.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
];
