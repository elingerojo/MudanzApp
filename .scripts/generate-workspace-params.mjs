#!/usr/bin/env node
/**
 * generate-workspace-params.mjs
 *
 * Fuente única de los nombres del workspace. Lee un nombre público y deriva todos los
 * identificadores internos y externos que la plantilla, el manual y las reglas necesitan,
 * y escribe dos artefactos en `.scripts/`:
 *
 *   - workspace-params.json   verdad de máquina (orden determinista, sin credenciales)
 *   - workspace-params.md     contexto legible para la Fase 1 (tablas listas para pegar)
 *
 * Uso:
 *   node .scripts/generate-workspace-params.mjs MudanzApp
 *
 * Sin dependencias y sin red: el archivo se puede ejecutar antes de que exista `package.json`.
 * Nunca lee `.env*`, nunca imprime credenciales y nunca inventa un valor que solo existe en
 * remoto (esos quedan como `pending` con la sección del manual que los produce).
 *
 * Se corre en la Fase 1, antes del primer bring-up. Desde la primera fila observada en
 * `.scripts/workspace-env.md` §5 los dos artefactos son un snapshot congelado: la evidencia de
 * cómo se inició la implementación, no una fuente viva de hechos de plataforma.
 *
 * Contrato de códigos de salida:
 *   0  archivos escritos (o `--dry-run` validado)
 *   1  invariante interna rota (defecto del generador, no del argumento)
 *   2  uso o argumento inválido
 *   3  guarda de sobrescritura: el contrato existente pertenece a otra app
 *   4  fallo de escritura
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_VERSION = '1.0.0';
const SCHEMA_VERSION = 1;
const SCRIPT_PATH = '.scripts/generate-workspace-params.mjs';
const OUTPUT_JSON = 'workspace-params.json';
const OUTPUT_MD = 'workspace-params.md';
const DEFAULT_FRONTENDS = ['frontend', 'wiki'];
const DEFAULT_OUT_DIR = dirname(fileURLToPath(import.meta.url));

const EXIT = Object.freeze({ OK: 0, INTERNAL: 1, USAGE: 2, GUARD: 3, WRITE: 4 });

const SLUG_PATTERN = /^[a-z][a-z0-9]{1,31}$/;
const RESERVED_SLUGS = new Set([
  'postgres',
  'template0',
  'template1',
  'information_schema',
  'pg_catalog',
  'user',
  'role',
  'admin',
  'root',
  'public',
]);

const HELP = `generate-workspace-params.mjs — nombres del workspace, de una sola fuente

Uso:
  node ${SCRIPT_PATH} <APP_NAME> [opciones]

Argumento:
  <APP_NAME>            Nombre público configurable (por ejemplo MudanzApp).
                        El slug interno se deriva en minúsculas y solo [a-z0-9].
                        No se renombra después: elige una vez, con colisión verificada.

Cuándo se corre:
  En la Fase 1, antes del primer bring-up. Desde la primera fila observada en
  .scripts/workspace-env.md §5 el snapshot queda congelado: regenerarlo después es una
  desviación registrada con --force, no una rutina.

Opciones:
  --slug <slug>         Fija el nombre interno a mano. Existe porque .guidelines/01 pide un
                        nombre interno estable y sin carga de marca; si se omite, se deriva.
  --frontends <lista>   Lista separada por comas. Default: ${DEFAULT_FRONTENDS.join(',')}
  --out-dir <dir>       Directorio de salida. Default: ${SCRIPT_PATH.replace(/[^/]+$/, '')}
  --force               Sobrescribe un contrato existente generado para otra app.
  --dry-run             Valida y renderiza sin escribir.
  --help, -h            Esta ayuda.

Salida:
  <out-dir>/${OUTPUT_JSON}    verdad de máquina
  <out-dir>/${OUTPUT_MD}      contexto de la Fase 1

Códigos de salida: 0 ok, 1 invariante rota, 2 uso o argumento inválido,
3 guarda de sobrescritura, 4 fallo de escritura.`;

class CliError extends Error {
  constructor(code, message, exitCode, details = []) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

function parseArgs(argv) {
  const args = {
    appName: null,
    slug: null,
    frontends: null,
    outDir: null,
    force: false,
    dryRun: false,
    help: false,
  };
  const takeValue = (flag, index) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new CliError('E_USAGE_MISSING_VALUE', `la opción ${flag} exige un valor`, EXIT.USAGE, [
        `uso: node ${SCRIPT_PATH} <APP_NAME> ${flag} <valor>`,
      ]);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--slug') {
      args.slug = takeValue('--slug', index);
      index += 1;
    } else if (arg === '--frontends') {
      args.frontends = takeValue('--frontends', index);
      index += 1;
    } else if (arg === '--out-dir') {
      args.outDir = takeValue('--out-dir', index);
      index += 1;
    } else if (arg.startsWith('-')) {
      throw new CliError('E_USAGE_UNKNOWN_FLAG', `opción desconocida: ${arg}`, EXIT.USAGE, [
        'usa --help para ver las opciones',
      ]);
    } else if (args.appName === null) {
      args.appName = arg;
    } else {
      throw new CliError(
        'E_USAGE_UNEXPECTED_ARGUMENT',
        'solo se admite un nombre de app',
        EXIT.USAGE,
        [`sobrante: ${arg}`],
      );
    }
  }

  return args;
}

function normalizeSlug(input) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseFrontends(raw) {
  if (raw === null) return [...DEFAULT_FRONTENDS];
  const list = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (list.length === 0) {
    throw new CliError('E_FRONTENDS_EMPTY', '--frontends no puede quedar vacío', EXIT.USAGE);
  }
  for (const frontend of list) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(frontend)) {
      throw new CliError(
        'E_FRONTENDS_INVALID',
        `nombre de frontend inválido: ${frontend}`,
        EXIT.USAGE,
        ['el directorio y el workspace usan solo [a-z0-9-] y empiezan por letra'],
      );
    }
  }
  if (new Set(list).size !== list.length) {
    throw new CliError('E_FRONTENDS_DUPLICATED', 'hay frontends repetidos', EXIT.USAGE);
  }
  return list;
}

function buildModel(args) {
  const publicName = args.appName.trim();
  if (publicName.length === 0) {
    throw new CliError('E_APP_NAME_EMPTY', 'el nombre público no puede quedar vacío', EXIT.USAGE);
  }
  if (publicName.length > 64) {
    throw new CliError('E_APP_NAME_TOO_LONG', 'el nombre público supera 64 caracteres', EXIT.USAGE);
  }
  const hasControlChars = [...publicName].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 0x20 || codePoint === 0x7f;
  });
  if (hasControlChars) {
    throw new CliError(
      'E_APP_NAME_CONTROL_CHARS',
      'el nombre público trae caracteres de control',
      EXIT.USAGE,
    );
  }
  if (!/[A-Za-z]/.test(publicName.normalize('NFD'))) {
    throw new CliError(
      'E_APP_NAME_NOT_ALPHABETIC',
      'el nombre público no contiene letras ASCII',
      EXIT.USAGE,
      [
        'el slug interno se deriva de letras y dígitos; un nombre solo numérico o solo simbólico no sirve',
      ],
    );
  }

  const derivedSlug = normalizeSlug(publicName);
  const slug = args.slug === null ? derivedSlug : args.slug;

  if (!SLUG_PATTERN.test(slug)) {
    throw new CliError(
      args.slug === null ? 'E_SLUG_INVALID' : 'E_SLUG_OVERRIDE_INVALID',
      `el slug interno no cumple ${SLUG_PATTERN}: ${slug}`,
      EXIT.USAGE,
      ['solo minúsculas y dígitos, empieza por letra, entre 2 y 32 caracteres'],
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new CliError(
      'E_SLUG_RESERVED',
      `el slug interno es una palabra reservada de Postgres o de rol: ${slug}`,
      EXIT.USAGE,
      ['elige otro nombre interno: se usa como rol y como base de datos'],
    );
  }

  const frontends = parseFrontends(args.frontends);
  const npmScope = `@${slug}`;

  const packages = {
    root: slug,
    shared: `${npmScope}/shared`,
    backend: `${npmScope}/backend`,
    frontends: frontends.map((frontend) => ({ frontend, name: `${npmScope}/${frontend}` })),
  };

  const databases = {
    role: slug,
    dev: slug,
    test: `${slug}_test`,
    devBranch: `${slug}_branch`,
    devBranchTest: `${slug}_branch_test`,
  };

  const workers = frontends.map((frontend, index) => ({
    frontend,
    name: index === 0 ? slug : `${slug}-${frontend}`,
    primary: index === 0,
    url: null,
    status: 'pending',
    source: 'manual §3.5',
  }));

  const conventions = {
    localStoragePrefix: `${slug}.`,
    docPointers: [
      `resumen-funcional-app-${slug}.md`,
      `stack-tecnologico-app-${slug}.md`,
      `modelo-datos-app-${slug}.md`,
      `decisiones-tecnicas-app-${slug}.md`,
    ],
  };

  const storage = {
    status: 'not-applicable',
    resource: null,
    reason: 'el bootstrap no declara capacidad de archivos',
    suggestedIfNeeded: `${slug}-staging`,
  };

  const parameters = [
    {
      marker: 'APP_NAME',
      value: publicName,
      nature: 'public',
      status: 'resolved',
      derivation: 'argumento',
    },
    {
      marker: 'APP_SLUG',
      value: slug,
      nature: 'internal',
      status: 'resolved',
      derivation: args.slug === null ? 'nombre público normalizado a [a-z0-9]' : 'override --slug',
    },
    {
      marker: 'NPM_SCOPE',
      value: npmScope,
      nature: 'internal',
      status: 'resolved',
      derivation: '"@" + APP_SLUG',
    },
    {
      marker: 'GIT_REPO',
      value: publicName,
      nature: 'public',
      status: 'resolved',
      derivation: 'nombre público; el owner de la URL queda pendiente',
    },
    {
      marker: 'DB_ROLE',
      value: databases.role,
      nature: 'internal',
      status: 'resolved',
      derivation: 'APP_SLUG',
    },
    {
      marker: 'DB_DEV',
      value: databases.dev,
      nature: 'internal',
      status: 'resolved',
      derivation: 'APP_SLUG',
    },
    {
      marker: 'DB_TEST',
      value: databases.test,
      nature: 'internal',
      status: 'resolved',
      derivation: 'DB_DEV + "_test" (local-only)',
    },
    {
      marker: 'DB_DEV_BRANCH',
      value: databases.devBranch,
      nature: 'internal',
      status: 'resolved',
      derivation: 'DB_DEV + "_branch"',
    },
    {
      marker: 'DB_DEV_BRANCH_TEST',
      value: databases.devBranchTest,
      nature: 'internal',
      status: 'resolved',
      derivation: 'DB_DEV_BRANCH + "_test" (local-only)',
    },
    {
      marker: 'FRONTENDS',
      value: frontends.join(', '),
      nature: 'internal',
      status: 'resolved',
      derivation: 'argumento --frontends o default',
    },
    {
      marker: 'WORKER_NAME',
      value: workers.map((worker) => worker.name).join(', '),
      nature: 'internal',
      status: 'resolved',
      derivation: 'primero APP_SLUG; el resto APP_SLUG + "-" + ⟨FE⟩; ver workers[]',
    },
    {
      marker: 'NEON_PROJECT',
      value: publicName,
      nature: 'platform',
      status: 'resolved',
      derivation: 'etiqueta de plataforma; puede cambiar sin tocar el código',
    },
    {
      marker: 'RAILWAY_PROJECT',
      value: publicName,
      nature: 'platform',
      status: 'resolved',
      derivation: 'etiqueta de plataforma; puede cambiar sin tocar el código',
    },
    {
      marker: 'BACKEND_HOST',
      value: null,
      nature: 'pending',
      status: 'pending',
      derivation: 'manual §3.4 paso 5; sin barra final',
    },
    {
      marker: 'COMPAT_DATE',
      value: null,
      nature: 'pending',
      status: 'pending',
      derivation: 'se confirma al crear cada wrangler.jsonc; propuesta del manual §0.1: 2026-10-06',
    },
    {
      marker: 'STORAGE',
      value: null,
      nature: 'not-applicable',
      status: 'not-applicable',
      derivation: 'solo si la app guarda archivos; propuesta: ' + storage.suggestedIfNeeded,
    },
  ];

  const pending = [
    {
      marker: 'BACKEND_HOST',
      alsoKnownAs: 'BACKEND_PUBLIC_URL',
      source: 'manual §3.4 (dominio público de Railway)',
      note: 'se necesita antes de construir los Workers; sin barra final',
    },
    {
      marker: 'APP_BASE_URL',
      source: 'manual §3.6',
      note: 'todos los orígenes de los Workers, separados por comas; se completa al final',
    },
    {
      marker: 'COMPAT_DATE',
      source: 'manual §3.5 y plantilla §0',
      note: 'una fecha por wrangler.jsonc, en formato YYYY-MM-DD',
    },
    {
      marker: 'GIT_REMOTE_URL',
      source: 'manual §3.1',
      note: 'owner y URL del repositorio; el nombre del repo sí se deriva del nombre público',
    },
    {
      marker: 'WORKERS_DEV_SUBDOMAIN',
      source: 'manual §3.5',
      note: 'subdominio de workers.dev donde cuelga cada WORKER_NAME',
    },
    {
      marker: 'NEON_ROLE',
      source: 'manual §3.2',
      note: 'rol existente del proyecto Neon (por ejemplo neondb_owner); no se deriva',
    },
    {
      marker: 'STORAGE',
      source: 'manual §3.3',
      note: 'no aplica en el bootstrap; sin capacidad de archivos no hay bucket ni token',
    },
  ];

  const invariantChecks = [
    ['I1', `APP_SLUG cumple ${SLUG_PATTERN}`, SLUG_PATTERN.test(slug)],
    ['I2', 'NPM_SCOPE es "@" + APP_SLUG', npmScope === `@${slug}`],
    ['I3', 'DB_TEST es DB_DEV + "_test"', databases.test === `${databases.dev}_test`],
    [
      'I4',
      'DB_DEV_BRANCH es DB_DEV + "_branch"',
      databases.devBranch === `${databases.dev}_branch`,
    ],
    [
      'I5',
      'DB_DEV_BRANCH_TEST es DB_DEV_BRANCH + "_test"',
      databases.devBranchTest === `${databases.devBranch}_test`,
    ],
    [
      'I6',
      'toda base de prueba termina en _test y no se sufija dos veces',
      [databases.test, databases.devBranchTest].every(
        (name) => name.endsWith('_test') && !name.endsWith('_test_test'),
      ),
    ],
    [
      'I7',
      'hay un WORKER_NAME por frontend y ninguno se repite',
      workers.length === frontends.length &&
        new Set(workers.map((w) => w.name)).size === frontends.length,
    ],
    [
      'I8',
      'cada WORKER_NAME empieza por APP_SLUG',
      workers.every((worker) => worker.name === slug || worker.name.startsWith(`${slug}-`)),
    ],
    [
      'I9',
      'los nombres de paquete son únicos',
      new Set([
        packages.root,
        ...packages.frontends.map((f) => f.name),
        packages.shared,
        packages.backend,
      ]).size ===
        3 + packages.frontends.length,
    ],
    [
      'I10',
      'el prefijo de localStorage termina en "."',
      conventions.localStoragePrefix.endsWith('.'),
    ],
    [
      'I11',
      'cada base local termina en _test o es la principal o la dev branch',
      [databases.dev, databases.test, databases.devBranch, databases.devBranchTest].every(
        (name) => name === slug || name === `${slug}_branch` || name.endsWith('_test'),
      ),
    ],
  ];

  const broken = invariantChecks.filter(([, , holds]) => !holds);
  if (broken.length > 0) {
    throw new CliError(
      'E_INVARIANT_BROKEN',
      'una derivación interna no cumple su invariante',
      EXIT.INTERNAL,
      broken.map(([id, statement]) => `${id}: ${statement}`),
    );
  }

  const invariants = invariantChecks.map(([id, statement, holds]) => ({ id, statement, holds }));

  const renameMap = [
    {
      from: 'MiApp',
      to: publicName,
      kind: 'public',
      where: [
        'shared/src/brand.json (appName) y shared/src/brand.ts (acceso tipado)',
        'index.html de cada frontend (title) y metadatos',
        'manifest del frontend',
        'copy de UI que consuma brand',
        'e2e/ y specs que comparan texto visible',
        'prosa de .plans/',
      ],
    },
    {
      from: 'miapp',
      to: slug,
      kind: 'internal',
      where: [
        'package.json raíz (name)',
        'SQL de rol y de las cuatro bases locales',
        '.roo/rules/04-verificacion.md (miapp_test, miapp_branch, miapp_branch_test)',
        '.roo/rules/06-datos.md (ejemplo de derivación _branch)',
        'name de cada wrangler.jsonc',
        'prefijo de claves de localStorage',
        'literales de e2e/support/harness.ts',
        '.plans/modelo-datos-app-miapp.md y demás punteros',
      ],
    },
    {
      from: '@miapp',
      to: npmScope,
      kind: 'internal',
      where: [
        'package.json de shared, backend y cada frontend',
        'imports @miapp/shared en backend/src/app.ts y en el componente de estado',
        'comentarios y documentación técnica',
        'package-lock.json: se regenera con npm install, nunca se edita a mano',
      ],
    },
    {
      from: 'miapp-wiki',
      to: workers.find((worker) => !worker.primary)?.name ?? `${slug}-wiki`,
      kind: 'internal',
      where: ['wiki/wrangler.jsonc', 'dashboard de Cloudflare', 'documentación de despliegue'],
    },
    {
      from: '*-app-miapp.md',
      to: `*-app-${slug}.md`,
      kind: 'pointer',
      where: [
        '.plans/resumen-funcional-app-miapp.md',
        '.plans/stack-tecnologico-app-miapp.md',
        '.plans/modelo-datos-app-miapp.md',
        '.plans/decisiones-tecnicas-app-miapp.md',
        'citas en .roo/rules/01-scope.md y .roo/rules/00-stack.md',
        'citas en .roo/rules/05-deps.md y .roo/rules/06-datos.md',
        'tabla de .plans/indice-contexto.md',
      ],
    },
    {
      from: 'miapp-staging',
      to: storage.suggestedIfNeeded,
      kind: 'internal',
      where: ['solo si aparece ⟨STORAGE⟩; hoy no hay capacidad de archivos'],
    },
  ];

  const brandSurfaces = [
    {
      surface: 'Título y metadatos',
      consumer: 'shared/src/brand.json -> brand.ts -> index.html',
      status: 'existe `publicName`; `.scripts/generate-brand-index.mjs` lo escribe en el artefacto',
    },
    {
      surface: 'Manifest',
      consumer: 'shared/src/brand.json',
      status: 'pendiente de crear en Fase 2/3',
    },
    {
      surface: 'Copy de UI',
      consumer: 'brand.ts tipado; nunca cableado',
      status: 'pendiente del primer ciclo que toque UI',
    },
    {
      surface: 'Correos',
      consumer: 'primera capacidad que envíe correo',
      status: 'fuera del bootstrap',
    },
    {
      surface: 'Legales',
      consumer: 'documentos externos enlazados',
      status: 'fuera del bootstrap',
    },
    {
      surface: 'Dominio y handles',
      consumer: 'externo; se planifican redirecciones',
      status: 'fuera del bootstrap',
    },
  ];

  return {
    publicName,
    slug,
    npmScope,
    frontends,
    packages,
    databases,
    workers,
    conventions,
    storage,
    parameters,
    pending,
    invariants,
    renameMap,
    brandSurfaces,
    slugSource: args.slug === null ? 'derived' : 'override',
    sourceArgument: args.appName,
    sourceFrontends: args.frontends,
  };
}

function renderJson(model) {
  const document = {
    schemaVersion: SCHEMA_VERSION,
    generator: { script: SCRIPT_PATH, version: SCRIPT_VERSION },
    source: {
      argument: model.sourceArgument,
      slugOverride: model.slugSource === 'override' ? model.slug : null,
      frontendsArgument: model.sourceFrontends,
    },
    identity: {
      public: { appName: model.publicName },
      internal: { appSlug: model.slug, npmScope: model.npmScope },
    },
    parameters: model.parameters,
    packages: model.packages,
    databases: model.databases,
    workers: model.workers,
    conventions: model.conventions,
    storage: model.storage,
    pending: model.pending,
    invariants: model.invariants,
    renameMap: model.renameMap,
    brandSurfaces: model.brandSurfaces,
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

function mdCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/</g, '<').replace(/>/g, '>');
}

function code(value) {
  const text = String(value);
  return /^[A-Za-z0-9@._/*:<>-]+$/.test(text) ? `\`${text}\`` : mdCell(text);
}

const NATURE_LABEL = {
  public: 'pública',
  internal: 'interna',
  platform: 'plataforma',
  pending: 'pendiente',
  'not-applicable': 'no aplica',
};

const STATUS_LABEL = {
  resolved: 'resuelto',
  pending: 'pendiente',
  'not-applicable': 'no aplica',
};

const KIND_LABEL = {
  public: 'pública',
  internal: 'interna',
  pointer: 'puntero',
};

function listCell(value) {
  return String(value)
    .split(', ')
    .map((item) => code(item))
    .join(', ');
}

function parameterCell(parameter) {
  if (parameter.status === 'pending') return '—';
  if (parameter.status === 'not-applicable') return 'no aplica';
  return listCell(parameter.value);
}

function renderMarkdown(model) {
  const {
    publicName,
    slug,
    packages,
    databases,
    workers,
    conventions,
    storage,
    parameters,
    pending,
    invariants,
    renameMap,
    brandSurfaces,
    slugSource,
  } = model;

  const lines = [];
  const add = (...items) => lines.push(...items);

  const scriptName = SCRIPT_PATH.replace(/^\.scripts\//, '');
  const scriptLink = `[\`${scriptName}\`](./${scriptName})`;

  add(`# Parámetros del workspace — ${publicName}`, '');
  add(
    '> **Generado automáticamente; no se edita a mano.** Lo produce',
    `> ${scriptLink} a partir del argumento \`${model.sourceArgument}\`.`,
    '> Se regenera con el mismo comando y se versiona: es la fuente única de los nombres de la',
    '> Fase 1 y del mapa de renombrado al copiar la plantilla.',
    '',
    '> **Qué es y qué no es.** Es un registro de nombres, no de credenciales: no contiene valores',
    '> de `.env*`, ni cadenas de conexión, ni tokens. Los hechos que solo existen en remoto figuran',
    '> como `pending` con la sección del manual que los produce; no se inventan.',
    '',
    '> **Snapshot del punto de arranque.** Se corre en la Fase 1, antes del primer bring-up. Desde la',
    '> primera fila observada en [`workspace-env.md`](workspace-env.md) §5 este par de artefactos queda',
    '> **congelado**: es la evidencia de cómo se inició la implementación, no una fuente viva de hechos',
    '> de plataforma. Regenerarlo después de ese punto es una desviación registrada con `--force`, no',
    '> una rutina.',
    '',
    `> **Identidad fijada:** nombre público \`${publicName}\` (configurable) y nombre interno`,
    `> \`${slug}\` (${slugSource === 'derived' ? 'derivado del público' : 'fijado con --slug'}); se elige una vez y no se renombra.`,
    '',
  );

  add('## 1. Cómo se genera', '');
  add('```bash', `node ${SCRIPT_PATH} ${model.sourceArgument}`, '```', '');
  add(
    `- Salida: \`${OUTPUT_JSON}\` (verdad de máquina) y \`${OUTPUT_MD}\` (este archivo), ambos en \`.scripts/\`.`,
    `- Regeneración idempotente: correr dos veces con el mismo argumento produce bytes idénticos.`,
    `- La guarda de sobrescritura compara \`${OUTPUT_JSON}.identity.internal.appSlug\`: si el contrato`,
    '  existente pertenece a otra app, el script sale con código `3` y no escribe. Solo `--force`',
    '  cambia el contrato, y ese cambio tiene costo de renombrado (`.guidelines/01` §3).',
    '- `--dry-run` valida y renderiza sin escribir; `--help` lista las opciones.',
    '',
    '| Código | Significado |',
    '| --- | --- |',
    '| `0` | archivos escritos o `--dry-run` validado |',
    '| `1` | invariante interna rota (defecto del generador) |',
    '| `2` | uso o argumento inválido |',
    '| `3` | guarda: el contrato existente es de otra app |',
    '| `4` | fallo de escritura |',
    '',
  );

  add('## 2. Identidad en dos nombres', '');
  add(
    '| Nombre | Naturaleza | Valor | Dónde vive | Política |',
    '| --- | --- | --- | --- | --- |',
    `| Público | marca, configurable | ${code(publicName)} | \`shared/src/brand.json\` con acceso tipado en \`shared/src/brand.ts\` | se espera que cambie; renombrado presupuestado |`,
    `| Interno | técnico, fijo | ${code(slug)} | npm, Postgres, Workers, bucket, claves y repositorio | se elige una vez; **no se renombra** |`,
    '',
    '- Las URLs técnicas y los identificadores usan el nombre interno; la marca se resuelve en la',
    '  capa de presentación o con un dominio propio ([`01`](../.guidelines/01-alcance-y-momento-de-decision.md) §3).',
    '- El nombre interno se eligió por unicidad y estabilidad, no por marketing. Derivarlo del',
    '  nombre público es una comodidad: si la marca cambia, el interno **no** cambia con ella.',
    '',
  );

  add('## 3. Marcadores de la plantilla §0', '');
  add(
    'Tabla lista para pegar en [`plantilla-inicializacion-workspace.md`](../.plans/plantilla-inicializacion-workspace.md) §0 y en el',
    '[`manual`](../.plans/manual-setup-workspace-local-y-remoto.md) §0.1. La fuente sigue siendo la plantilla; esta tabla es',
    'la instantánea que evita teclear marcadores ambiguos, y el `Estado` de cada fila es el del',
    'momento del snapshot: `pendiente` no afirma que el hecho siga sin conocerse.',
    '',
    '| Marcador | Valor | Naturaleza | Estado | Derivación |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const parameter of parameters) {
    const nature = NATURE_LABEL[parameter.nature] ?? parameter.nature;
    const status =
      parameter.status === 'pending'
        ? 'pendiente (ver §4)'
        : (STATUS_LABEL[parameter.status] ?? parameter.status);
    add(
      `| \`⟨${parameter.marker}⟩\` | ${parameterCell(parameter)} | ${nature} | ${status} | ${mdCell(parameter.derivation)} |`,
    );
  }
  add('');

  add('## 4. Valores pendientes al momento del snapshot', '');
  add(
    'Se obtienen en remoto y se confirman a mano, siguiendo el',
    '[`manual`](../.plans/manual-setup-workspace-local-y-remoto.md) §3. `pending` describe lo que este',
    'generador **no puede derivar** del nombre público; no afirma que el hecho siga sin conocerse. La',
    'fuente viva de los hechos observados es [`workspace-env.md`](workspace-env.md) §5, que este',
    'snapshot no duplica.',
    '',
  );
  add('| Marcador | Se obtiene en | Nota |', '| --- | --- | --- |');
  for (const item of pending) {
    add(`| \`${item.marker}\` | ${mdCell(item.source)} | ${mdCell(item.note)} |`);
  }
  add('');

  add('## 5. Invariantes verificadas por el generador', '');
  add('| # | Invariante | Cumple |', '| --- | --- | --- |');
  for (const invariant of invariants) {
    add(`| ${invariant.id} | ${mdCell(invariant.statement)} | ${invariant.holds ? 'sí' : 'no'} |`);
  }
  add('');

  add('## 6. Contrato técnico derivado', '');
  add('### 6.1 Paquetes (npm workspaces)', '');
  add(
    '| Paquete | Nombre |',
    '| --- | --- |',
    `| raíz (privado) | ${code(packages.root)} |`,
    `| shared | ${code(packages.shared)} |`,
    `| backend | ${code(packages.backend)} |`,
  );
  for (const frontend of packages.frontends) {
    add(`| ${code(frontend.frontend)} | ${code(frontend.name)} |`);
  }
  add('');

  add('### 6.2 Workers (uno por frontend)', '');
  add('| Frontend | `WORKER_NAME` | URL | Estado |', '| --- | --- | --- | --- |');
  for (const worker of workers) {
    const urlCell = mdCell(`pending (${worker.source})`);
    add(`| ${code(worker.frontend)} | ${code(worker.name)} | ${urlCell} | ${worker.status} |`);
  }
  add('');
  add(
    '- La URL de cada Worker fue un hecho de plataforma: el snapshot la deja `pending` porque no',
    '  puede derivarla, y el valor observado vive en [`workspace-env.md`](workspace-env.md) §5.',
    '- El `name` del dashboard **debe coincidir** con el de su `wrangler.jsonc` o el build falla.',
    '- El primer frontend toma el slug; los demás, `<slug>-<fe>`.',
    '',
  );

  add('### 6.3 Convenciones', '');
  add(
    `- Prefijo de claves de \`localStorage\`: ${code(conventions.localStoragePrefix)}`,
    `- Punteros de documentos (se renombran al copiar): ${conventions.docPointers.map(code).join(', ')}`,
    `- Almacenamiento: ${STATUS_LABEL[storage.status] ?? storage.status} — ${mdCell(storage.reason)}. Si aparece, ${code(storage.suggestedIfNeeded)}.`,
    '',
  );

  add('## 7. SQL listo para pegar', '');
  add('### 7.1 Local (rol no superusuario y cuatro bases)', '');
  add('```sql', `CREATE ROLE ${databases.role} LOGIN;`);
  add(`CREATE DATABASE ${databases.dev} OWNER ${databases.role};`);
  add(`CREATE DATABASE ${databases.test} OWNER ${databases.role};`);
  add(`CREATE DATABASE ${databases.devBranch} OWNER ${databases.role};`);
  add(`CREATE DATABASE ${databases.devBranchTest} OWNER ${databases.role};`, '```', '');
  add(
    '- Ejecutar sin `BEGIN`: `CREATE DATABASE` no corre dentro de una transacción.',
    '- Fijar la contraseña con `\\password <rol>` dentro de `psql`, nunca en la línea de comandos.',
    '- `psql` y `createdb` no están en el `PATH`; usar la ruta del binario (manual §2.2).',
    '',
  );

  add('### 7.2 Neon (mismo host, sin ramas de Neon)', '');
  add('```sql', `CREATE DATABASE ${databases.dev} OWNER neondb_owner;`);
  add(`CREATE DATABASE ${databases.devBranch} OWNER neondb_owner;`, '```', '');
  add(
    '- `neondb_owner` es el rol existente del proyecto; no se deriva (manual §3.2).',
    '- La dev branch remota es una **base más** en el mismo host: una rama de Neon cambia el host',
    '  y rompe la derivación `_branch`.',
    `- \`${databases.test}\` y \`${databases.devBranchTest}\` son local-only: no se crean en remoto.`,
    '',
  );

  add('## 8. Variables de entorno: solo nombres', '');
  add(
    'Ningún valor se escribe aquí. El nombre de la base aparece en la ruta de la cadena, y la',
    'contraseña **nunca** se escribe en este archivo ni se imprime.',
    '',
    '| Archivo | Variable | Forma |',
    '| --- | --- | --- |',
    `| \`backend/.env.local\` | \`DATABASE_URL\` | ${code(`postgresql://${databases.role}:<password>@localhost:5432/${databases.dev}`)} |`,
    '| `backend/.env.local` | `PORT` | opcional, default 3000 |',
    '| `backend/.env.local` | `NODE_ENV` | opcional, default `development` |',
    '| `backend/.env.migration.local` | `DATABASE_URL` | cadena **directa** de Neon; solo comandos remotos |',
    '',
    '- Una variable vacía cuenta como ausente; `dotenv` está prohibido; se carga con',
    '  `--env-file-if-exists=.env.local`.',
    '- Si la contraseña contiene `@`, `:`, `/`, `?` o `#`, se codifica con percent-encoding.',
    '- La URL de pruebas y las de la dev branch se **derivan** (`_test`, `_branch`, `_branch_test`)',
    '  y nunca se transportan ni se imprimen (`.roo/rules/07-secretos.md`).',
    '',
  );

  add('## 9. Superficies del nombre público (`.guidelines/01` §3)', '');
  add(
    'Inventario del renombrado público; la marca vive solo en la primera columna de consumo.',
    'El `Estado` es el del momento del snapshot; la evidencia viva son `shared/src/brand.json`,',
    '`shared/src/brand.ts` y `.scripts/generate-brand-index.mjs`',
    '([`decisiones`](../.plans/decisiones-tecnicas-app-mudanzapp.md) §14.3).',
    '',
  );
  add('| Superficie | Se consume en | Estado |', '| --- | --- | --- |');
  for (const item of brandSurfaces) {
    add(`| ${mdCell(item.surface)} | ${mdCell(item.consumer)} | ${mdCell(item.status)} |`);
  }
  add('');

  add('## 10. Mapa de renombrado al copiar la plantilla', '');
  add(
    'Tokens exactos del workspace de origen y todos los lugares que tocan. El reemplazo es',
    'asistido, nunca a mano sobre el lockfile.',
    '',
    '- Verificar el resultado con una búsqueda acotada (`git grep -n`), nunca con un comodín que',
    '  indexe archivos ignorados.',
    '- `package-lock.json` se regenera con `npm install`; editarlo a mano rompe la ortografía del',
    '  scope.',
    '',
  );
  for (const entry of renameMap) {
    const kind = KIND_LABEL[entry.kind] ?? entry.kind;
    add(`### \`${entry.from}\` → ${code(entry.to)}`, '');
    add(`Naturaleza: ${kind}.`, '');
    for (const where of entry.where) {
      add(`- ${where}`);
    }
    add('');
  }

  add('## 11. Qué hacer en la Fase 1', '');
  add(
    '1. Leer este archivo junto con [`plantilla-inicializacion-workspace.md`](../.plans/plantilla-inicializacion-workspace.md) §0 y el',
    '   [`manual`](../.plans/manual-setup-workspace-local-y-remoto.md) §0.1.',
    '2. Pegar la tabla de §3 en §0 de la plantilla; es la instantánea de conveniencia, no la fuente.',
    '3. Verificar colisión antes de scaffoldear: scope npm, nombre de Worker, nombre de repo y de rol.',
    '4. Crear el rol y las cuatro bases con §7.1, y fijar la contraseña con `\\password`.',
    '5. Aplicar el mapa de §10 a lo copiado en la Fase 0, empezando por los punteros de `.plans/` y las',
    '   citas de `.roo/rules/`; la copia del manifiesto y `git init` son de la Fase 0.',
    '6. Regenerar este archivo y anotar las versiones de `Man-2.1`: es la evidencia versionada de la fase.',
    '7. No dar por conocidos los valores de §4: se completan en su sección del manual.',
    '',
  );

  add('## 12. Límites del script', '');
  add(
    '- No verifica colisión real: `@' +
      slug +
      '` en npm, `' +
      slug +
      '` en Cloudflare y el repositorio',
    '  exigen red y son pasos de la Fase 1.',
    '- No crea credenciales, no lee `.env*`, no se conecta a nada y no imprime valores.',
    '- No renombra el workspace: describe el renombrado y deja el reemplazo al ciclo que lo ejecute.',
    '- No decide el nombre interno cuando cambia el público: el interno se fija aquí y se mantiene.',
  );

  return `${lines.join('\n')}\n`;
}

function verifyGuard(outDir, model, force) {
  const jsonPath = join(outDir, OUTPUT_JSON);
  const mdPath = join(outDir, OUTPUT_MD);
  const hasJson = existsSync(jsonPath);
  const hasMd = existsSync(mdPath);
  if (!hasJson && !hasMd) return;

  if (!hasJson && hasMd) {
    if (force) return;
    throw new CliError(
      'E_GUARD_FOREIGN_MD',
      `existe ${OUTPUT_MD} sin ${OUTPUT_JSON}: no se puede verificar a qué app pertenece`,
      EXIT.GUARD,
      ['revisa el archivo o usa --force'],
    );
  }

  let existing = null;
  try {
    existing = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch {
    // Archivo presente pero ilegible: se trata como contrato ajeno, no como propio.
  }

  const existingSlug =
    existing && existing.schemaVersion === SCHEMA_VERSION && existing.identity?.internal?.appSlug
      ? existing.identity.internal.appSlug
      : null;

  if (existingSlug === model.slug) return;
  if (force) return;

  throw new CliError(
    'E_GUARD_OTHER_APP',
    'el contrato existente pertenece a otra app y no se sobrescribe',
    EXIT.GUARD,
    [
      `existente: ${existingSlug ?? 'desconocido (archivo ajeno o ilegible)'}`,
      `solicitada: ${model.slug}`,
      'usa --force solo si el nombre anterior ya no aplica; el renombrado tiene costo',
    ],
  );
}

function displayPath(absolutePath) {
  const relativePath = relative(process.cwd(), absolutePath);
  return relativePath.length > 0 && !relativePath.startsWith('..') ? relativePath : absolutePath;
}

function run(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return EXIT.OK;
  }
  if (args.appName === null) {
    throw new CliError('E_MISSING_APP_NAME', 'falta el argumento <APP_NAME>', EXIT.USAGE, [
      `uso: node ${SCRIPT_PATH} MudanzApp`,
    ]);
  }

  const model = buildModel(args);
  const outDir = args.outDir === null ? DEFAULT_OUT_DIR : resolve(process.cwd(), args.outDir);
  verifyGuard(outDir, model, args.force);

  const json = renderJson(model);
  const md = renderMarkdown(model);
  const jsonPath = join(outDir, OUTPUT_JSON);
  const mdPath = join(outDir, OUTPUT_MD);

  if (args.dryRun) {
    process.stdout.write(
      `dry-run ok: app=${model.publicName} slug=${model.slug} frontends=${model.frontends.join(',')}\n` +
        `would write ${displayPath(jsonPath)} (${json.length} bytes)\n` +
        `would write ${displayPath(mdPath)} (${md.length} bytes)\n`,
    );
    return EXIT.OK;
  }

  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(mdPath, md, 'utf8');
    writeFileSync(jsonPath, json, 'utf8');
  } catch (error) {
    throw new CliError('E_WRITE_FAILED', 'no se pudieron escribir los archivos', EXIT.WRITE, [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  process.stdout.write(
    `wrote ${displayPath(mdPath)}\n` +
      `wrote ${displayPath(jsonPath)}\n` +
      `app=${model.publicName} slug=${model.slug} scope=${model.npmScope} workers=${model.workers
        .map((worker) => worker.name)
        .join(',')}\n`,
  );
  return EXIT.OK;
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error) {
  if (error instanceof CliError) {
    process.stderr.write(`[${error.code}] ${error.message}\n`);
    for (const detail of error.details) {
      process.stderr.write(`  - ${detail}\n`);
    }
    process.exitCode = error.exitCode;
  } else {
    process.stderr.write(
      `[E_UNEXPECTED] ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = EXIT.INTERNAL;
  }
}
