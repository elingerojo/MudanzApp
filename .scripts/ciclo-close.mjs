#!/usr/bin/env node
// Imprime el gate proporcional, los tiles sugeridos, el cuerpo del commit y el checklist de
// cierre de plans/workflow-ciclos.md §9. No ejecuta comandos y no hace el commit.
import { gateFor, gitChangedFiles, listPlanFiles, readRepoFile, routeTiles } from './ciclo-lib.mjs';

function parseArgs(argv) {
  const options = { id: null, plan: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--id') options.id = argv[(index += 1)] ?? null;
    else if (arg === '--plan') options.plan = argv[(index += 1)] ?? null;
  }
  return options;
}

function findPlan(options) {
  if (options.plan) return options.plan;
  if (!options.id) return null;
  const id = options.id.toLowerCase();
  return listPlanFiles().find((plan) => plan.includes(`plan-ciclo-${id}-`)) ?? null;
}

function hypothesisOf(plan) {
  if (!plan) return '<una frase>';
  const text = readRepoFile(plan) ?? '';
  const match = /^> \*\*Hip[oó]tesis:\*\* (.+)$/m.exec(text);
  return match ? match[1] : '<una frase>';
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('uso: npm run ciclo:close -- [--id <ID>] [--plan <ruta>]');
    console.log('Imprime gate, tiles, cuerpo de commit y checklist. No commitea.');
    return 0;
  }

  const files = gitChangedFiles();
  const plan = findPlan(options);
  const tiles = routeTiles(files);

  console.log(`ciclo: ${options.id ?? '<sin id>'}`);
  console.log(`plan: ${plan ?? '<sin plan>'}`);
  console.log('');
  console.log('gate (un comando por invocacion, en este orden):');
  for (const command of gateFor(files)) console.log(`  npm run ${command}`);
  console.log('');
  console.log(
    tiles.length > 0
      ? `tiles sugeridos por wiki-delta §3: ${tiles.join(', ')}`
      : 'tiles sugeridos: ninguno — si declaras sin delta, escribe el motivo',
  );
  console.log('');
  console.log('cuerpo del commit:');
  console.log('');
  console.log(`<tipo>(<alcance>): <asunto corto en ingles>`);
  console.log('');
  console.log(`Ciclo: ${options.id ?? '<ID>'} — <nombre>`);
  console.log(`Hipotesis: ${hypothesisOf(plan)}`);
  console.log('Corte: <que se construyo y que no>');
  console.log('Evidencia: <comandos y aserciones>');
  console.log(
    tiles.length > 0 ? `wiki: ${tiles.join(', ')} — <que cambio>` : 'wiki: sin delta — <motivo>',
  );
  console.log('');
  console.log('checklist de cierre (workflow-ciclos §9):');
  console.log('  [ ] la evidencia responde la hipotesis');
  console.log('  [ ] el gate corrio completo, en verde');
  console.log('  [ ] delta del tile en el commit, o sin delta con motivo');
  console.log('  [ ] asunto en ingles con tipo y alcance de 02-commits');
  console.log('  [ ] resumen-funcional §4 en presente; §3/§3.1 al dia');
  console.log('  [ ] fila del backlog con cerrada <sha> <fecha>; encabezado al dia');
  console.log('  [ ] el item de la bandeja desaparecio o quedo con destino');
  console.log('  [ ] decisiones, modelo-datos o commit deps solo si aplican');
  return 0;
}

process.exitCode = main();
