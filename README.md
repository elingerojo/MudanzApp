# MudanzApp

Monorepo TypeScript de MudanzApp: contrato compartido, API y **un workspace Angular por frontend**.

| Directorio  | Qué es                                                                                   | Paquete               |
| ----------- | ---------------------------------------------------------------------------------------- | --------------------- |
| `shared/`   | Tipos y valores de runtime del contrato; los esquemas `zod` llegan con el primer payload | `@mudanzapp/shared`   |
| `backend/`  | API Express en ESM sobre Postgres, SQL crudo con `pg`                                    | `@mudanzapp/backend`  |
| `frontend/` | SPA principal (Angular v22 standalone, zoneless)                                         | `@mudanzapp/frontend` |
| `wiki/`     | Segundo frontend: SPA mínima de una ruta                                                 | `@mudanzapp/wiki`     |
| `e2e/`      | Arnés Playwright; **no** es un workspace                                                 | —                     |

El arranque **no** contiene funcionalidades: solo el humo (healthcheck del backend y componente de
estado en cada frontend). Cada capacidad entra con su ciclo, según `.guidelines/00`–`07`.

Este archivo es la fuente autoritativa de la operación. El gate vive en
[`04-verificacion`](.roo/rules/04-verificacion.md:1); los datos y los secretos, en
[`06-datos`](.roo/rules/06-datos.md:1) y [`07-secretos`](.roo/rules/07-secretos.md:1). Los
procedimientos de consola que dependen de la máquina están en el manual de setup local, que **no se
versiona**.

---

## 1. Prerrequisitos

| Requisito               | Detalle                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node                    | Ventana de `engines` en [`package.json`](package.json:7): `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0`. Node 22+ es obligatorio por `--env-file-if-exists`. **No** hay `.nvmrc`: el mecanismo de fijación es `engines` |
| npm                     | Viene con Node; una sola instalación, siempre **en la raíz**                                                                                                                                                     |
| git                     | Repositorio local con rama `main`                                                                                                                                                                                |
| PostgreSQL local        | Versión 18 asumida; rol **no superusuario** y cuatro bases (§3)                                                                                                                                                  |
| Navegador de Playwright | `npx playwright install` (sin él, `test:e2e` falla antes de abrir la primera página)                                                                                                                             |
| Prohibido               | `dotenv` (las variables se leen de `process.env`); orquestadores de dev loop                                                                                                                                     |

No hacen falta en local: `APP_BASE_URL`, `BACKEND_PUBLIC_URL`, `ADMIN_TOKEN` ni credenciales de
integración. En desarrollo el frontend consume el backend por **proxy** (`/api`) y no hay CORS.
`BACKEND_PUBLIC_URL` y `ADMIN_TOKEN` figuran en `backend/.env.example` como **inventario de nombres
reservados** (decisión `C8` de la auditoría): ninguna capacidad las lee todavía (§4).

---

## 2. Puesta en marcha

Un comando por invocación, desde la raíz:

```bash
npm install
```

```bash
npx playwright install
```

- `npm install` enlaza los workspaces, deja **un** lockfile y ejecuta el `prepare` de `shared`, que
  compila `shared/dist`. Si `shared/dist` no existe, el typecheck del backend fallará por tipos
  ausentes.
- Crear `backend/.env.local` (ignorado por git) con los nombres de §4. La referencia versionada es
  [`backend/.env.example`](backend/.env.example:1).
- Aplicar el esquema a las **cuatro** bases locales, una invocación por comando (§7).

---

## 3. Bases de datos locales

Local tiene cuatro objetivos; remoto solo `main` y `branch`. Las bases `_test` son **local-only**:
no hay tests en producción.

| Objetivo      | Base                    | Uso                                           |
| ------------- | ----------------------- | --------------------------------------------- |
| `main`        | `mudanzapp`             | Desarrollo; `test:e2e` **no** la toca         |
| `test`        | `mudanzapp_test`        | Suites con base y arnés e2e                   |
| `branch`      | `mudanzapp_branch`      | Dev branch de base de datos (única y estable) |
| `branch-test` | `mudanzapp_branch_test` | Suites con base y e2e de la dev branch        |

Como superusuario, sin envolver el archivo en una transacción (`CREATE DATABASE` no corre dentro de
`BEGIN`):

```sql
CREATE ROLE mudanzapp LOGIN;
CREATE DATABASE mudanzapp OWNER mudanzapp;
CREATE DATABASE mudanzapp_test OWNER mudanzapp;
CREATE DATABASE mudanzapp_branch OWNER mudanzapp;
CREATE DATABASE mudanzapp_branch_test OWNER mudanzapp;
```

- La contraseña se fija con `\password mudanzapp` dentro de `psql`, **nunca** en la línea de
  comandos.
- `psql` y `createdb` no están en el `PATH`: usar la ruta del binario de la instalación.
- Si la contraseña contiene `@`, `:`, `/`, `?` o `#`, se codifica con percent-encoding al construir
  la URL.
- La URL de pruebas y las de la dev branch **se derivan** de `DATABASE_URL` (`_test`, `_branch`,
  `_branch_test`); no se escriben a mano, no se transportan y **nunca se imprimen**. El único camino
  autorizado es un script del repo que las consume dentro del proceso
  ([`07-secretos`](.roo/rules/07-secretos.md:1)).

---

## 4. Variables de entorno (solo nombres)

Los valores no se versionan y no se imprimen. Una variable **vacía cuenta como ausente**.

| Archivo                        | Variable             | Papel                                                                                         |
| ------------------------------ | -------------------- | --------------------------------------------------------------------------------------------- |
| `backend/.env.local`           | `DATABASE_URL`       | **Única obligatoria en local**: `postgresql://mudanzapp:<password>@localhost:5432/mudanzapp`  |
| `backend/.env.local`           | `PORT`               | Opcional; default `3000`                                                                      |
| `backend/.env.local`           | `NODE_ENV`           | Opcional; default `development`                                                               |
| `backend/.env.local`           | `APP_BASE_URL`       | Allowlist de CORS, un origen por frontend separados por comas; se usa en remoto y en el arnés |
| `backend/.env.local`           | `BACKEND_PUBLIC_URL` | **Reservada, sin lector hoy**: origen público del backend; solo remoto                        |
| `backend/.env.local`           | `ADMIN_TOKEN`        | **Reservada, sin lector hoy**: solo cuando exista la capacidad de administración              |
| `backend/.env.migration.local` | `DATABASE_URL`       | Cadena **directa** de Neon; solo comandos `db:migrate:remote*` y `db:ping:remote*`            |

- `process.env` se lee **una sola vez**, en [`backend/src/config.ts`](backend/src/config.ts:1). El
  servidor no lanza al importar: lo que falta se registra en `warnings` y `/health` sigue
  respondiendo.
- `PORT` es la única variable con **dos hechos distintos** y no se confunden: en `backend/.env.local`
  es opcional y el default del código es `3000`; en **Railway es obligatoria con valor `3000`**
  (§12). Una variable vacía cuenta como ausente, así que `PORT=` en Railway no fija nada: se
  escribe `PORT=3000`.
- Las integraciones (`APP_MODE`, `R2_MODE`, `AI_MODE`, `AI_MODEL`) y sus credenciales se añaden
  **cuando su capacidad exista**; hoy no se leen. En pruebas y arnés van en `fake`.
- `BACKEND_PUBLIC_URL` y `ADMIN_TOKEN` son **nombres reservados**, no requisitos: se conservan para
  que el ciclo que cree su capacidad no invente el nombre (decisión `C8`). Ningún módulo las lee y
  una instalación que las omita funciona igual.
- La configuración del navegador se **compila**: el frontend no lee `process.env`. El origen del
  backend vive en [`environment.ts`](frontend/src/environments/environment.ts:1) y en
  [`environment.production.ts`](frontend/src/environments/environment.production.ts:1) de cada
  frontend, ya fijado con `⟨BACKEND_HOST⟩` en el bring-up remoto y compilado dentro del bundle: si
  el host cambia, se reconstruye y se redespliega ese Worker.

---

## 5. Dev loop (una terminal por pieza, sin orquestador)

| Terminal | Comando                              | Qué levanta                                       | Puerto |
| -------- | ------------------------------------ | ------------------------------------------------- | ------ |
| 1        | `npm run dev:shared`                 | `tsc --watch` sobre `shared`                      | —      |
| 2        | `npm run dev:api`                    | `tsx watch` con `--env-file-if-exists=.env.local` | `3000` |
| 3        | `npm run dev:web:frontend`           | `ng serve` del SPA principal                      | `4200` |
| 4        | `npm run dev -w wiki -- --port 4201` | `ng serve` del segundo frontend                   | `4201` |

- Solo un frontend usa `4200`; el segundo se levanta con `--port 4201`. El puerto es siempre
  **explícito**: `ng serve` honra `PORT` y heredaría el del backend.
- En desarrollo el frontend llama `/api`, que
  [`proxy.conf.json`](frontend/proxy.conf.json:1) reescribe hacia `http://localhost:3000`; por eso no
  hay CORS. En producción la llamada es cross-origin y la permite `APP_BASE_URL`.
- Si un puerto está ocupado, no se deja adivinar: se pasa `--port` explícito y falla ruidosamente.

---

## 6. Contrato de scripts raíz

| Script                                                              | Comando                                             | Uso                                                |
| ------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| `build` / `start`                                                   | `shared` + `backend` / `node backend/dist/index.js` | Despliegue del backend; producción nunca usa `tsx` |
| `build:web:frontend` / `build:web:wiki`                             | `shared` + el frontend                              | Build de cada Worker                               |
| `dev:shared` / `dev:api` / `dev:web:<FE>`                           | `tsc -w` / `tsx watch` / `ng serve`                 | Dev loop, una terminal por pieza                   |
| `typecheck` / `typecheck:e2e`                                       | `tsc --noEmit` por workspace / `e2e/tsconfig.json`  | Gate                                               |
| `test`                                                              | unitarios de todos los workspaces                   | Corrida barata en frío, **sin** base               |
| `test:api` / `test:web:frontend` / `test:web:wiki`                  | Vitest de un workspace                              | Unitarios por pieza                                |
| `test:api:db` / `test:api:db:branch`                                | Suites con base; URL derivada                       | Datos                                              |
| `test:e2e` / `test:e2e:branch`                                      | `tsx e2e/run-e2e.ts [--branch]`                     | Ruta crítica                                       |
| `db:ping[:test][:branch][:branch:test][:remote][:remote:branch]`    | Conectividad; emite solo `ok` o un error estable    | Datos                                              |
| `db:migrate[:test][:branch][:branch:test][:remote][:remote:branch]` | Migración **manual**, nunca en el arranque          | Datos                                              |
| `lint` / `format:check`                                             | Pasada única desde la raíz (incluye `e2e/`)         | Gate                                               |

Reglas del contrato:

- `shared` compila en `npm install` (`prepare`): `npm ci` + `npm run build` bastan.
- `shared` **no** declara runner unitario mientras no tenga suites: `vitest run` sin archivos sale
  `1` y tumbaría el alias raíz. El alias `test` usa `--if-present`, así que el runner solo existe
  donde hay specs.
- El `build` de cada frontend ejecuta `brand:index` **después** de `ng build`: la marca entra al
  artefacto, no al fuente. `ng serve` no lo ejecuta y el título lo fija la app al arrancar.
- Nada de bundlers ni alias de código fuente en runtime.
- `npm test` es **unit-only**: el arnés levanta backend y frontends.
- El arnés **no** migra: exige `db:migrate:test` o `db:migrate:branch:test` ejecutados antes.
- Un comando por invocación y **una sola corrida de verificación a la vez**.

---

## 7. Migraciones

La ruta automática —`backend/sql/*.sql`, aplicada por el runner— es **hacia adelante e idempotente**,
sin `DROP` y sin tabla de seguimiento. El runner ejecuta **todos** los archivos en cada invocación,
así que un `DROP` ahí destruiría datos por corrida y no por despliegue: esa mecánica es la razón de la
prohibición y de que no exista tabla de seguimiento.

La contracción tiene su propio camino: `backend/sql/contract/`, que el runner no enumera. Es un
archivo versionado, revisado e idempotente (`IF EXISTS`) que se aplica a mano después de la corrida
aditiva del mismo destino. Y el sandbox —`_test` y `_branch`— es desechable entero: se destruye y se
reconstruye con el runner. Los destinos protegidos son dos y solo dos: `mudanzapp` local y remota.

Todo se aplica **a mano**; nunca en el arranque.

```bash
npm run db:migrate
```

```bash
npm run db:migrate:test
```

```bash
npm run db:migrate:branch
```

```bash
npm run db:migrate:branch:test
```

- La experimentación vive en la **dev branch**; la rama principal no es un sandbox.
- En remoto solo existen `db:migrate:remote` (`main`) y `db:migrate:remote:branch` (`branch`), ambas
  contra la cadena directa de `backend/.env.migration.local`. Los objetivos `_test` remotos se
  rechazan con error estable.
- La fuente única del modelo es `.plans/modelo-datos-app-mudanzapp.md`; el DDL debe coincidir.

---

## 8. Contrato del humo del backend

| Ruta             | Respuesta                                                                    |
| ---------------- | ---------------------------------------------------------------------------- |
| `GET /health`    | **Siempre** `200` con `{ status: 'ok', database }`; liveness no es readiness |
| `GET /health/db` | `200` con `database: ok`, o `503` con `not-configured` / `error`             |

- Orden de middleware: CORS → `express.json()` → health → `handleErrors`.
- CORS es **aditivo**: allowlist desde la configuración tipada, un origen por frontend separados por
  comas, barra final normalizada, `OPTIONS` `204`; sin `Origin` pasa sin cabeceras. El módulo **no**
  lee `process.env`.
- Apagado ordenado: `server.close()` y después `database.close()`.

---

## 9. Frontends

- Angular v22 **standalone**, **zoneless**, Signals-first, `httpResource` y plantillas en archivos
  `.html` separados (nunca inline).
- Tailwind v4 **CSS-first**: `@import "tailwindcss"` en `src/styles.css` y `@tailwindcss/postcss`
  como único PostCSS plugin.
- `environments` + `fileReplacements` **solo** en la configuración `production`; el origen del
  backend entra por el token `API_BASE_URL`.
- La marca vive en `shared/src/brand.json`; el `index.html` de cada frontend deja su título **vacío**
  y `.scripts/generate-brand-index.mjs` lo escribe en el artefacto construido. El fuente no cablea el
  nombre público (`decisiones` §14.3 y su criterio de crecimiento).
- Rutas `''` y `**` (redirigida a `''`); el fallback de SPA en el Worker lo da
  `not_found_handling`.
- Unitarios con Vitest (`globals`, pool `threads`) enganchado por `runnerConfig`. El e2e es
  **Playwright**, no `ng e2e`.

---

## 10. Arnés e2e

`e2e/` es autocontenido y **no** es un workspace.

- `npm run test:e2e` ejecuta [`run-e2e.ts`](e2e/run-e2e.ts:1), que carga `backend/.env.local`,
  **deriva** la base de pruebas y la inyecta en el proceso. Un `npx playwright test` suelto se
  rechaza con un error estable: apuntaría a la base de desarrollo.
- `global-setup` **verifica** el esquema y no migra: si falta, falla ruidosamente.
- Un `project` por frontend, tres `webServer` (backend + un `ng serve` por frontend) y `workers: 1`
  porque las suites comparten una sola base.
- Si un puerto del arnés (`3000`, `4200`, `4201`) ya escucha, la corrida se rechaza: **no** puede
  haber un `dev:api` levantado contra la base de desarrollo.
- El humo abre **cada** frontend y exige proceso `ok` y base `ok` en el DOM real, con el valor
  observado como evidencia. El reporte queda en `e2e/playwright-report/`.

---

## 11. Matriz de verificación (local, un comando por invocación)

**Checklist completo, no la definición del gate.** El gate lo define
[`.roo/rules/04-verificacion.md`](.roo/rules/04-verificacion.md:1) —mínimo «siempre» y filas
condicionales por tipo de corte—; esta matriz reúne además lo que el arranque verifica de una sola
pasada. Si discrepan, manda la regla.

| Verificación                 | Comando                                                  | Resultado esperado                      | Requiere antes                           |
| ---------------------------- | -------------------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| Tipos                        | `npm run typecheck`                                      | 0 errores                               | `npm install`                            |
| Tipos del arnés              | `npm run typecheck:e2e`                                  | 0 errores                               | `npm install`                            |
| Unitarios                    | `npm run test`                                           | Verde (backend + cada frontend)         | —                                        |
| Unitarios del backend        | `npm run test:api`                                       | Verde                                   | —                                        |
| Unitarios de un frontend     | `npm run test:web:frontend` · `npm run test:web:wiki`    | Verde                                   | —                                        |
| Suites con base              | `npm run test:api:db`                                    | Verde; la URL se deriva y no se imprime | `db:migrate:test`                        |
| Suites con base (dev branch) | `npm run test:api:db:branch`                             | Verde                                   | `db:migrate:branch:test`                 |
| Lint                         | `npm run lint`                                           | 0 errores (raíz y `e2e/` incluidos)     | —                                        |
| Formato                      | `npm run format:check`                                   | 0 diferencias                           | —                                        |
| Build del backend            | `npm run build`                                          | Emite `backend/dist/index.js`           | —                                        |
| Build de un frontend         | `npm run build:web:frontend` · `npm run build:web:wiki`  | Emite el bundle con Tailwind aplicado   | —                                        |
| Conectividad                 | `npm run db:ping` · `:test` · `:branch` · `:branch:test` | `ok` en las cuatro bases locales        | bases creadas                            |
| Ruta crítica                 | `npm run test:e2e`                                       | Humo en verde con reporte revisable     | `db:migrate:test`; puertos libres        |
| Ruta crítica (dev branch)    | `npm run test:e2e:branch`                                | Humo en verde                           | `db:migrate:branch:test`; puertos libres |

Notas de corrida:

- Las suites y el arnés **no** migran: la migración es un paso manual previo.
- Nunca encadenar `npm test` con otros comandos; nunca `ng test` sin `--watch=false` (el script ya
  lo incluye).
- Tras una instalación limpia, la primera corrida de `test:web:<FE>` puede no recolectar pruebas por
  el margen del pool `threads`: reintentar ese único comando. Correr `test:api` primero deja la caché
  lista.
- Si `test:e2e` falla por navegador ausente, `npx playwright install` y repetir solo ese comando.

---

## 12. Contrato de despliegue

Declarado y ejercitado una vez en local; el bring-up remoto es **manual** y no forma parte del gate
de ciclo.

| Pieza               | Contrato                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend             | Contrato en el **dashboard** de Railway: build `npm run build`, start `npm run start`, healthcheck `/health` y watch paths. Producción nunca usa `tsx` ni `--env-file` |
| Puerto del backend  | **`PORT=3000` como variable del servicio**; el dominio público apunta al target port `3000` y el healthcheck `/health` se evalúa contra ese puerto                     |
| Frontends           | **Un Worker de assets por frontend** (Cloudflare Workers, no Pages), sin `main` ni `_redirects`                                                                        |
| Nombre del Worker   | **Idéntico** al `name` de su [`wrangler.jsonc`](frontend/wrangler.jsonc:1) y al del dashboard                                                                          |
| Build del Worker    | `npm run build:web:<FE>` (compila `shared` antes: Angular resuelve tipos desde `dist`)                                                                                 |
| Deploy              | `npx wrangler deploy -c <FE>/wrangler.jsonc`; `wrangler` es devDependency **raíz**                                                                                     |
| Config del frontend | `environment.production.ts` se compila: si cambia el host del backend, hay que reconstruir **ese** Worker                                                              |
| CORS                | `APP_BASE_URL` con **todos** los orígenes de los Workers, separados por comas                                                                                          |
| CI/CD               | No hay workflows; la protección de rama es un paso manual del remoto                                                                                                   |

- El contrato del backend **no** vive en el repo. Config as Code está deprecado y un servicio nuevo
  **no** lo lee, así que no se crea `railway.json` ni `railway.toml`: los valores se capturan en el
  dashboard y se verifican en `Man-3.4`, que es su única copia. Los watch paths excluyen
  `frontend/`, `wiki/`, `e2e/`, `.plans/` y `.roo/`.
- `PORT` **se define, no se hereda**. Un servicio nuevo recibe un puerto por defecto de la
  plataforma (hoy `8080`); omitir la variable deja el contrato del repo —`3000` en
  [`backend/src/config.ts`](backend/src/config.ts:12), en [`proxy.conf.json`](frontend/proxy.conf.json:1)
  y en el arnés— describiendo un puerto distinto del que producción usa. La variable del servicio es
  la **única fuente** del puerto de producción; el target port del dominio y el healthcheck la
  siguen, nunca la contradicen. El default `3000` del código aplica solo a local y a las pruebas.
- El despliegue invoca los scripts **de la raíz**, no la variante por workspace: `build` compila
  `shared` antes del backend y el backend resuelve sus tipos desde `shared/dist`.

---

## 13. Versionado y reglas

- Se versionan `.roo/rules/**` y `.roo/rules-orchestrator/**`; **nunca** `.roo/mcp.json` (lleva
  credenciales). `.roo/mcp.example.json` sí, con placeholders no secretos.
- Se versionan los documentos fuente de `.plans/`; la plantilla de inicialización, el manual y los
  snippets son documentos locales de trabajo y **no** se versionan.
- `.env` y `.env.*` no se versionan; `.env.example` sí, solo con nombres.
- Cada ciclo validado cierra con un commit convencional (`<tipo>(<alcance>): <descripción corta>`) que
  registra la hipótesis, el corte y la evidencia, sin secretos
  ([`02-commits`](.roo/rules/02-commits.md:1)).
- Si un valor de `.env*` aparece en una salida, **detenerse**, reportar archivo y variable (nunca el
  valor) y recomendar rotación.

---

## 14. Árbol de dependencias (medido tras la instalación limpia)

Medición de la corrida de cierre (2026-10-24), tras borrar `node_modules` y `shared/dist` y correr
`npm ci`:

| Medida                              | Valor                                                             |
| ----------------------------------- | ----------------------------------------------------------------- |
| Paquetes instalados / auditados     | 538 / 543                                                         |
| Avisos de auditoría                 | 5 (1 `low`, 2 `moderate`, 2 `high`); el gate no corre `npm audit` |
| Salida de `npm ls --all`            | **código 0**, 1 274 líneas y 490 marcadores `deduped`             |
| `shared/dist` emitido por `prepare` | sí, antes de cualquier otro comando                               |
| Lockfile                            | **uno**, en la raíz; ningún workspace tiene el suyo               |

El ruido de `npm ls` es **esperado**, no un defecto:

- **`UNMET OPTIONAL DEPENDENCY`** en binarios por plataforma y dependencias opcionales no instaladas
  (`@parcel/watcher-*`, `@img/sharp-*`, `@oxc-parser/*`, los bindings de `rolldown` y
  `lightningcss`, `workerd-*`, `fsevents`, `kerberos`, `karma`, `less`, `terser`, `@angular/ssr`,
  `@angular/platform-server`). Son aristas de un árbol que no se instalan en esta máquina.
- **`extraneous`**: `@emnapi/runtime` y `@img/sharp-wasm32`, transitivas opcionales de `sharp` (vía
  `wrangler`) que quedan en el árbol sin arista directa. No se declaran a mano.
- **`deduped`**: `typescript`, `vitest`, `@angular/*`, `tailwindcss`, `jsdom` y `@mudanzapp/shared`
  se hoistean una sola vez y el resto de los workspaces los reutiliza. Los cuatro workspaces se
  enlazan como symlinks (`-> .\backend`, `-> .\shared`, …).

Las dependencias de runtime se registran en `.plans/stack-tecnologico-app-mudanzapp.md` §12 y una
nueva entra con **aprobación explícita** y su propio commit `deps`
([`05-deps`](.roo/rules/05-deps.md:1)).
