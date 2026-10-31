// Única configuración de ESLint del monorepo (plantilla §2.1).
// Pasada única desde la raíz: `eslint .` cubre la raíz, `.scripts/`, cada workspace y `e2e/`.
// Las reglas de Angular se limitan a los frontends; el backend y `shared` no las consumen.
import js from '@eslint/js';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

const angularFrontends = ['frontend/**/*.ts', 'shop/**/*.ts', 'wiki/**/*.ts'];
const angularTemplates = ['frontend/**/*.html', 'shop/**/*.html', 'wiki/**/*.html'];

const scopeTo = (patterns) => (config) => ({ ...config, files: patterns });

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.angular/**',
      '**/coverage/**',
      // Codigo archivado en `.plans/referencia/`: no compila, no se mantiene y se lee como
      // referencia. Sin esta entrada, una regla futura lo marcaria como rojo ajeno al ciclo.
      '.plans/**',
      // Salidas del arnés: viven junto a `e2e/playwright.config.ts`, no en la raíz.
      '**/playwright-report/**',
      '**/blob-report/**',
      '**/test-results/**',
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
  // Reglas de Angular, solo para los workspaces de frontend (Fase 5).
  ...angular.configs.tsRecommended.map(scopeTo(angularFrontends)),
  {
    files: angularFrontends,
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
    },
  },
  ...angular.configs.templateRecommended.map(scopeTo(angularTemplates)),
  ...angular.configs.templateAccessibility.map(scopeTo(angularTemplates)),
];
