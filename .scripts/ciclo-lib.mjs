// Utilidades compartidas de los scripts `ciclo:*`.
// Leen el árbol de trabajo y no escriben documentos: los tres comandos son bookkeeping, no una
// segunda fuente de alcance (plans/workflow-ciclos.md §10).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(here, '..');

export const PATHS = {
  backlog: 'plans/backlog-funcionalidades-pendientes.md',
  resumen: '.plans/resumen-funcional-app-mudanzapp.md',
  template: 'plans/plantilla-plan-ciclo.md',
  wikiDelta: '.plans/wiki-delta.md',
};

export function readRepoFile(relPath) {
  const absolute = join(repoRoot, relPath);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
}

export function existsRepoPath(relPath) {
  return existsSync(join(repoRoot, relPath));
}

export function listPlanFiles() {
  const dir = join(repoRoot, 'plans');
  return readdirSync(dir)
    .filter((name) => /^plan-ciclo-.*\.md$/.test(name))
    .sort()
    .map((name) => `plans/${name}`);
}

/** Filas del backlog: `| **A1** | nombre | qué es | cómo | costo | fuente |`. */
export function parseBacklogRows(text) {
  const rows = [];
  const rowPattern = /^\|\s*\*\*([A-Z]\d+)\*\*\s*\|(.*)$/gm;
  let match;
  while ((match = rowPattern.exec(text)) !== null) {
    const cells = match[2].split('|').map((cell) => cell.trim());
    rows.push({ id: match[1], name: cells[0] ?? '', what: cells[1] ?? '' });
  }
  return rows;
}

export const STATUS_TOKENS = ['planeada', 'en curso', 'cerrada', 'aparcada'];

export function statusOf(row) {
  const match = new RegExp(`^(${STATUS_TOKENS.join('|')})\\b`).exec(row.what);
  return match ? match[1] : 'hipotesis';
}

/** Primer token entre backticks del nombre de una fila: el slug candidato. */
export function slugTokenOf(row) {
  const match = /`([a-z0-9][a-z0-9 _-]*)`/i.exec(row.name);
  return match ? match[1] : null;
}

export function slugify(text, fallback = 'ciclo') {
  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug || fallback;
}

export function listMigrations() {
  const dir = join(repoRoot, 'backend/sql');
  return readdirSync(dir)
    .filter((name) => /^\d{3}_.*\.sql$/.test(name))
    .sort();
}

/** Archivos sucios del árbol de trabajo: modificados, preparados y sin seguimiento. */
export function gitChangedFiles() {
  const out = execFileSync('git', ['status', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      let path = line.slice(3).trim();
      const arrow = path.indexOf(' -> ');
      if (arrow !== -1) path = path.slice(arrow + 4);
      return path.replace(/^"|"$/g, '').replace(/\\/g, '/');
    });
}

/**
 * Ruteo área → tile de `.plans/wiki-delta.md` §3.
 * Ordenado: si dos reglas aplican, gana la primera, y las de backend van antes que las de frontend.
 */
const TILE_RULES = [
  {
    code: 'M0',
    test: (p) =>
      p === 'wiki/src/app/tiles.ts' ||
      p === 'wiki/src/app/app.routes.ts' ||
      p === 'wiki/README.md' ||
      p.startsWith('wiki/src/app/ui/tile-header/'),
  },
  {
    code: 'A4',
    test: (p) =>
      p.startsWith('backend/sql/') ||
      /^backend\/src\/(config|errors|error-handler)\.ts$/.test(p) ||
      /^backend\/src\/(identity|storage|ai)\//.test(p),
  },
  {
    code: 'A2',
    test: (p) =>
      /^shared\/src\/(item|capture|ai)\.ts$/.test(p) ||
      /^backend\/src\/(items|captures|ai|storage)\//.test(p) ||
      /^backend\/src\/.*(invitation|session)/.test(p),
  },
  {
    code: 'A3',
    test: (p) =>
      /^shared\/src\/(event|listing|listing-page|cart|card)\.ts$/.test(p) ||
      p === 'shop/src/worker.ts',
  },
  {
    code: 'A1',
    test: (p) =>
      /^backend\/src\/routes\/(admin|events|items)-router\.ts$/.test(p) ||
      p.startsWith('frontend/src/app/dashboard'),
  },
  {
    code: 'A0',
    test: (p) =>
      p === 'frontend/src/app/app.routes.ts' ||
      p === 'shop/src/app/app.routes.ts' ||
      /^(frontend|shop)\/wrangler\.jsonc$/.test(p) ||
      /^shared\/src\/identity\.ts$/.test(p) ||
      /^(frontend|shop)\/src\/environments\//.test(p),
  },
  {
    code: 'E3',
    test: (p) =>
      p === '.roo/rules/04-verificacion.md' ||
      p === 'README.md' ||
      p.startsWith('e2e/') ||
      p.startsWith('backend/scripts/'),
  },
  {
    code: 'E1',
    test: (p) =>
      p === 'package.json' ||
      /^(shared|backend|frontend|shop|wiki)\/package\.json$/.test(p) ||
      p === '.roo/rules/00-stack.md' ||
      p === '.roo/rules/05-deps.md' ||
      p === 'backend/.env.example' ||
      p.startsWith('.scripts/') ||
      /^(eslint\.config\.js|tsconfig\.base\.json|\.prettierrc\.json|\.prettierignore)$/.test(p),
  },
  {
    code: 'E2',
    test: (p) =>
      p.startsWith('.plans/resumen-funcional') ||
      p === '.roo/rules/01-scope.md' ||
      p === 'plans/backlog-funcionalidades-pendientes.md',
  },
  {
    code: 'A5',
    test: (p) => p === 'wiki/src/app/app/a5-brechas/a5-brechas.component.html',
  },
];

export function routeTiles(files) {
  const tiles = new Set();
  for (const file of files) {
    const rule = TILE_RULES.find((candidate) => candidate.test(file));
    if (rule) tiles.add(rule.code);
  }
  return [...tiles];
}

/** Gate proporcional de `plans/workflow-ciclos.md` §7; `04-verificacion` manda si discrepa. */
export function gateFor(files) {
  const gates = ['typecheck', 'lint', 'format:check'];
  const has = (pattern) => files.some((file) => pattern.test(file));

  if (has(/^shared\//)) {
    gates.push('build:web:frontend', 'build:web:shop', 'build:web:wiki');
  }
  if (has(/^backend\//)) gates.push('test:api');
  if (has(/^backend\/sql\//)) gates.push('test:api:db', 'db:migrate:* a mano, uno por destino');
  if (has(/^backend\/(src\/index\.ts|package\.json|tsconfig\.build\.json)$/)) gates.push('build');
  if (has(/^e2e\//)) gates.push('typecheck:e2e');
  if (has(/^e2e\/.*\.spec\.ts$/)) gates.push('test:e2e');
  if (has(/^frontend\//)) gates.push('test:web:frontend', 'build:web:frontend');
  if (has(/^shop\//)) gates.push('test:web:shop', 'build:web:shop');
  if (has(/^wiki\//)) gates.push('test:web:wiki', 'build:web:wiki');
  if (has(/^(package\.json|\.roo\/)/)) gates.push('test:web:wiki', 'build:web:wiki');

  return [...new Set(gates)];
}

/** Destino de los planes: `plans/plan-ciclo-<id>-<slug>.md`. */
export function planPathFor(id, slug) {
  return `plans/plan-ciclo-${id.toLowerCase()}-${slug}.md`;
}

export function relFromRepo(absolutePath) {
  return relative(repoRoot, absolutePath).split(/[\\/]/).join('/');
}
