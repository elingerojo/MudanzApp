#!/usr/bin/env node
// Verifica los invariantes de plans/workflow-ciclos.md §10. No reescribe ningún documento:
// imprime violaciones con código estable y sale distinto de cero solo cuando el invariante es duro.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
  PATHS,
  existsRepoPath,
  gateFor,
  gitChangedFiles,
  listMigrations,
  listPlanFiles,
  parseBacklogRows,
  readRepoFile,
  repoRoot,
  routeTiles,
} from './ciclo-lib.mjs';

const hard = [];
const soft = [];
const info = [];

const CORE_LINK_FILES = new Set([
  'plans/workflow-ciclos.md',
  'plans/plantilla-plan-ciclo.md',
  'plans/inbox.md',
  'plans/backlog-funcionalidades-pendientes.md',
]);

function checkFiles() {
  for (const [name, path] of Object.entries(PATHS)) {
    if (!existsRepoPath(path)) hard.push(`ciclo-file-missing ${name}: ${path}`);
  }
}

function checkBacklog(text) {
  const rows = parseBacklogRows(text);
  if (rows.length === 0) hard.push('ciclo-backlog-empty: ninguna fila con id reconocida');
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) hard.push(`ciclo-id-duplicate ${row.id}`);
    seen.add(row.id);
  }
  info.push(`backlog: ${rows.length} filas`);
  return rows;
}

function checkMigrations() {
  const files = listMigrations();
  const numbers = files.map((name) => name.slice(0, 3));
  const seen = new Set();
  for (const number of numbers) {
    if (seen.has(number)) hard.push(`ciclo-migration-duplicate ${number}`);
    seen.add(number);
  }
  const highest = numbers.at(-1) ?? '000';
  const next = String(Number(highest) + 1).padStart(3, '0');
  const gaps = [];
  for (let index = 1; index <= Number(highest); index += 1) {
    const number = String(index).padStart(3, '0');
    if (!seen.has(number)) gaps.push(number);
  }
  info.push(`migraciones: ${highest} es la ultima, la siguiente es ${next}`);
  if (gaps.length > 0) info.push(`migraciones sin archivo (reservadas): ${gaps.join(', ')}`);
}

function checkPlans(rows, resumen) {
  const cited = `${resumen}\n${readRepoFile(PATHS.backlog) ?? ''}`;
  const plans = listPlanFiles();
  for (const plan of plans) {
    const name = plan.split('/').pop();
    if (!cited.includes(name)) soft.push(`ciclo-plan-uncited ${plan}`);
  }
  const declared = resumen.matchAll(
    /En alcance (?:de los ciclos|del ciclo|del corte) ([0-9a-z-]+)/gi,
  );
  for (const match of declared) {
    const cut = match[1].toLowerCase();
    if (/^\d+$/.test(cut)) continue;
    if (!plans.some((plan) => plan.toLowerCase().includes(`-${cut}-`))) {
      soft.push(
        `ciclo-declared-without-plan ${cut}: puede ser un corte dentro de un plan existente`,
      );
    }
  }
  for (const row of rows) {
    const status = /^`?([a-z ]+)`?/.exec(row.what)?.[1];
    if (status === 'cerrada' && !/cerrada [0-9a-f]{7,}/.test(row.what)) {
      soft.push(`ciclo-closed-without-sha ${row.id}`);
    }
  }
}

function checkLinks() {
  const changed = new Set(gitChangedFiles());
  const candidates = [];
  for (const dir of ['plans', '.plans']) {
    const absolute = join(repoRoot, dir);
    for (const name of readdirSync(absolute)) {
      if (!name.endsWith('.md')) continue;
      const repoPath = `${dir}/${name}`;
      if (CORE_LINK_FILES.has(repoPath) || changed.has(repoPath)) {
        candidates.push(join(absolute, name));
      }
    }
  }
  const reported = new Set();
  let internal = 0;
  let external = 0;
  for (const file of candidates) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const raw = match[1];
      if (/^(https?:|mailto:|#)/.test(raw) || raw.includes('<')) continue;
      const target = raw.replace(/:\d+$/, '').replace(/#.*$/, '');
      const absolute = resolve(dirname(file), target);
      if (!absolute.startsWith(repoRoot)) {
        external += 1;
        continue;
      }
      internal += 1;
      const repoPath = absolute
        .slice(repoRoot.length + 1)
        .split('\\')
        .join('/');
      if (!existsRepoPath(repoPath) && !reported.has(repoPath)) {
        reported.add(repoPath);
        soft.push(`ciclo-link-broken ${repoPath}`);
      }
    }
  }
  info.push(`enlaces revisados: ${internal} internos, ${external} fuera del repo`);
}

function reportWorktree() {
  const files = gitChangedFiles();
  info.push(`arbol de trabajo: ${files.length} archivos sucios`);
  for (const command of gateFor(files)) info.push(`gate ${command}`);
  const tiles = routeTiles(files);
  info.push(tiles.length > 0 ? `tiles sugeridos: ${tiles.join(', ')}` : 'tiles sugeridos: ninguno');
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('uso: npm run ciclo:check');
    console.log('Verifica invariantes del backlog, los planes, las migraciones y los enlaces.');
    return 0;
  }
  checkFiles();
  if (hard.length === 0) {
    const resumen = readRepoFile(PATHS.resumen) ?? '';
    const rows = checkBacklog(readRepoFile(PATHS.backlog) ?? '');
    checkMigrations();
    checkPlans(rows, resumen);
    checkLinks();
    reportWorktree();
  }
  for (const line of info) console.log(`info ${line}`);
  for (const line of soft) console.log(`warn ${line}`);
  for (const line of hard) console.log(`fail ${line}`);
  if (hard.length > 0) {
    console.log(`ciclo-check: ${hard.length} violaciones duras, ${soft.length} avisos`);
    return 1;
  }
  console.log(`ciclo-check: ok, ${soft.length} avisos`);
  return 0;
}

process.exitCode = main();
