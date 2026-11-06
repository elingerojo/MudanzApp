#!/usr/bin/env node
// Crea `plans/plan-ciclo-<id>-<slug>.md` desde la plantilla.
// Se niega si el corte no está declarado en `resumen-funcional`: es la promoción de
// plans/workflow-ciclos.md §4 convertida en guarda. No edita ninguna otra fuente.
import { writeFileSync } from 'node:fs';

import {
  PATHS,
  existsRepoPath,
  parseBacklogRows,
  planPathFor,
  readRepoFile,
  slugTokenOf,
  slugify,
} from './ciclo-lib.mjs';

function usage() {
  console.log('uso: npm run ciclo:new -- <ID> [--slug <slug>] [--dry-run]');
  console.log('ejemplo: npm run ciclo:new -- E1 --slug dashboard-plataforma');
  return 2;
}

function parseArgs(argv) {
  const options = { id: null, slug: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--slug') options.slug = argv[(index += 1)] ?? null;
    else if (!options.id) options.id = arg;
  }
  return options;
}

function isDeclared(id, name, resumen) {
  if (new RegExp(`\\b${id}\\b`).test(resumen)) return true;
  const token = slugTokenOf({ name });
  return token !== null && resumen.includes(token);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  if (!options.id) return usage();
  const id = options.id.toUpperCase();

  const template = readRepoFile(PATHS.template);
  if (template === null) {
    console.log(`ciclo-new-template-missing ${PATHS.template}`);
    return 1;
  }
  const backlog = readRepoFile(PATHS.backlog);
  const resumen = readRepoFile(PATHS.resumen);
  if (backlog === null || resumen === null) {
    console.log('ciclo-new-files-missing: backlog o resumen-funcional no existen');
    return 1;
  }

  const row = parseBacklogRows(backlog).find((candidate) => candidate.id === id);
  if (!row) {
    console.log(`ciclo-new-unknown-id ${id}: no hay fila en el backlog`);
    return 2;
  }
  if (!isDeclared(id, row.name, resumen)) {
    console.log(`ciclo-new-not-declared ${id}: falta su fila en resumen-funcional §3/§4`);
    console.log('promociona el corte primero: plans/workflow-ciclos.md §4');
    return 3;
  }

  const slug = options.slug ?? slugify(slugTokenOf(row) ?? row.name);
  const path = planPathFor(id, slug);
  if (existsRepoPath(path)) {
    console.log(`ciclo-new-exists ${path}`);
    return 4;
  }

  const content = template.split('<ID>').join(id).split('<slug>').join(slug);
  if (!options.dryRun) writeFileSync(path, content, 'utf8');
  console.log(`${options.dryRun ? 'dry-run ' : 'ok '}ciclo-new ${path}`);
  console.log('siguiente: completa §1, §6, §7, §8, §9 y §11; corre npm run ciclo:check');
  return 0;
}

process.exitCode = main();
