#!/usr/bin/env node
/**
 * Escribe el nombre público en el `<title>` del artefacto construido de un frontend.
 *
 * `shared/src/brand.json` es la única fuente del nombre público. El `index.html` de cada
 * frontend conserva un `<title>` **vacío** —no cablea la marca— y este paso, que corre después
 * de `ng build` dentro del mismo script `build`, escribe el valor en el HTML emitido.
 *
 * Por qué después y no antes: el builder de Angular falla cuando `index.input` apunta a una
 * ruta fuera de `src/` (`link.parentNode?.insertBefore is not a function`, medido en esta
 * versión), así que la entrada sigue siendo `src/index.html` y la inyección se aplica sobre la
 * salida. En `ng serve` no se ejecuta: el título lo fija la app al arrancar desde la misma
 * fuente.
 *
 * Sin dependencias, sin red y sin leer `.env*`. Determinista e idempotente. Falla ruidosamente
 * con un código estable (`.guidelines/05` §2 y §5) en vez de dejar un título vacío.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceDirectory = join(scriptsDirectory, '..');

const TITLE_ELEMENT = /<title>[\s\S]*?<\/title>/i;

function fail(code, guidance) {
  console.error(`${code}: ${guidance}`);
  process.exit(1);
}

function frontendArgument(argv) {
  const index = argv.indexOf('--frontend');
  return index === -1 ? undefined : argv[index + 1];
}

const frontend = frontendArgument(process.argv.slice(2));
if (typeof frontend !== 'string' || frontend.trim().length === 0) {
  fail(
    'brand-index-frontend-missing',
    'usage: node .scripts/generate-brand-index.mjs --frontend <FE>',
  );
}

const brandFile = join(workspaceDirectory, 'shared', 'src', 'brand.json');
const artifactFile = join(workspaceDirectory, frontend, 'dist', frontend, 'browser', 'index.html');

let brand;
try {
  brand = JSON.parse(await readFile(brandFile, 'utf8'));
} catch {
  fail('brand-index-source-unreadable', 'shared/src/brand.json is missing or is not valid JSON');
}

const publicName = typeof brand?.publicName === 'string' ? brand.publicName.trim() : '';
if (publicName.length === 0) {
  fail('brand-index-name-missing', 'shared/src/brand.json has no non-empty "publicName"');
}

let html;
try {
  html = await readFile(artifactFile, 'utf8');
} catch {
  fail(
    'brand-index-artifact-missing',
    `${frontend}/dist/${frontend}/browser/index.html does not exist; run the build before this step`,
  );
}

// El artefacto debe tener **exactamente** un elemento de título: con dos, el reemplazo podría
// tocar el equivocado (por ejemplo, uno citado dentro de un comentario) y dejar el real vacío.
const titleElements = html.match(new RegExp(TITLE_ELEMENT.source, 'gi')) ?? [];
if (titleElements.length === 0) {
  fail(
    'brand-index-title-missing',
    `${frontend}/src/index.html must keep an empty <title> element so it reaches the artifact`,
  );
}

if (titleElements.length > 1) {
  fail(
    'brand-index-title-ambiguous',
    `the artifact has ${String(titleElements.length)} title elements; keep exactly one, and never quote the tag inside a comment`,
  );
}

function escapeHtml(value) {
  return value.replaceAll('&', '&').replaceAll('<', '<').replaceAll('>', '>').replaceAll('"', '"');
}

await writeFile(
  artifactFile,
  html.replace(TITLE_ELEMENT, `<title>${escapeHtml(publicName)}</title>`),
  'utf8',
);
