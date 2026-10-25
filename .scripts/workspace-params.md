# Parámetros del workspace — MudanzApp

> **Generado automáticamente; no se edita a mano.** Lo produce
> [`generate-workspace-params.mjs`](./generate-workspace-params.mjs) a partir del argumento `MudanzApp`.
> Se regenera con el mismo comando y se versiona: es la fuente única de los nombres de la
> Fase 1 y del mapa de renombrado al copiar la plantilla.

> **Qué es y qué no es.** Es un registro de nombres, no de credenciales: no contiene valores
> de `.env*`, ni cadenas de conexión, ni tokens. Los hechos que solo existen en remoto figuran
> como `pending` con la sección del manual que los produce; no se inventan.

> **Snapshot del punto de arranque.** Se corre en la Fase 1, antes del primer bring-up. Desde la
> primera fila observada en [`workspace-env.md`](workspace-env.md) §5 este par de artefactos queda
> **congelado**: es la evidencia de cómo se inició la implementación, no una fuente viva de hechos
> de plataforma. Regenerarlo después de ese punto es una desviación registrada con `--force`, no
> una rutina.

> **Identidad fijada:** nombre público `MudanzApp` (configurable) y nombre interno
> `mudanzapp` (derivado del público); se elige una vez y no se renombra.

## 1. Cómo se genera

```bash
node .scripts/generate-workspace-params.mjs MudanzApp
```

- Salida: `workspace-params.json` (verdad de máquina) y `workspace-params.md` (este archivo), ambos en `.scripts/`.
- Regeneración idempotente: correr dos veces con el mismo argumento produce bytes idénticos.
- La guarda de sobrescritura compara `workspace-params.json.identity.internal.appSlug`: si el contrato
  existente pertenece a otra app, el script sale con código `3` y no escribe. Solo `--force`
  cambia el contrato, y ese cambio tiene costo de renombrado (`.guidelines/01` §3).
- `--dry-run` valida y renderiza sin escribir; `--help` lista las opciones.

| Código | Significado |
| --- | --- |
| `0` | archivos escritos o `--dry-run` validado |
| `1` | invariante interna rota (defecto del generador) |
| `2` | uso o argumento inválido |
| `3` | guarda: el contrato existente es de otra app |
| `4` | fallo de escritura |

## 2. Identidad en dos nombres

| Nombre | Naturaleza | Valor | Dónde vive | Política |
| --- | --- | --- | --- | --- |
| Público | marca, configurable | `MudanzApp` | `shared/src/brand.json` con acceso tipado en `shared/src/brand.ts` | se espera que cambie; renombrado presupuestado |
| Interno | técnico, fijo | `mudanzapp` | npm, Postgres, Workers, bucket, claves y repositorio | se elige una vez; **no se renombra** |

- Las URLs técnicas y los identificadores usan el nombre interno; la marca se resuelve en la
  capa de presentación o con un dominio propio ([`01`](../.guidelines/01-alcance-y-momento-de-decision.md) §3).
- El nombre interno se eligió por unicidad y estabilidad, no por marketing. Derivarlo del
  nombre público es una comodidad: si la marca cambia, el interno **no** cambia con ella.

## 3. Marcadores de la plantilla §0

Tabla lista para pegar en [`plantilla-inicializacion-workspace.md`](../.plans/plantilla-inicializacion-workspace.md) §0 y en el
[`manual`](../.plans/manual-setup-workspace-local-y-remoto.md) §0.1. La fuente sigue siendo la plantilla; esta tabla es
la instantánea que evita teclear marcadores ambiguos, y el `Estado` de cada fila es el del
momento del snapshot: `pendiente` no afirma que el hecho siga sin conocerse.

| Marcador | Valor | Naturaleza | Estado | Derivación |
| --- | --- | --- | --- | --- |
| `⟨APP_NAME⟩` | `MudanzApp` | pública | resuelto | argumento |
| `⟨APP_SLUG⟩` | `mudanzapp` | interna | resuelto | nombre público normalizado a [a-z0-9] |
| `⟨NPM_SCOPE⟩` | `@mudanzapp` | interna | resuelto | "@" + APP_SLUG |
| `⟨GIT_REPO⟩` | `MudanzApp` | pública | resuelto | nombre público; el owner de la URL queda pendiente |
| `⟨DB_ROLE⟩` | `mudanzapp` | interna | resuelto | APP_SLUG |
| `⟨DB_DEV⟩` | `mudanzapp` | interna | resuelto | APP_SLUG |
| `⟨DB_TEST⟩` | `mudanzapp_test` | interna | resuelto | DB_DEV + "_test" (local-only) |
| `⟨DB_DEV_BRANCH⟩` | `mudanzapp_branch` | interna | resuelto | DB_DEV + "_branch" |
| `⟨DB_DEV_BRANCH_TEST⟩` | `mudanzapp_branch_test` | interna | resuelto | DB_DEV_BRANCH + "_test" (local-only) |
| `⟨FRONTENDS⟩` | `frontend`, `wiki` | interna | resuelto | argumento --frontends o default |
| `⟨WORKER_NAME⟩` | `mudanzapp`, `mudanzapp-wiki` | interna | resuelto | primero APP_SLUG; el resto APP_SLUG + "-" + ⟨FE⟩; ver workers[] |
| `⟨NEON_PROJECT⟩` | `MudanzApp` | plataforma | resuelto | etiqueta de plataforma; puede cambiar sin tocar el código |
| `⟨RAILWAY_PROJECT⟩` | `MudanzApp` | plataforma | resuelto | etiqueta de plataforma; puede cambiar sin tocar el código |
| `⟨BACKEND_HOST⟩` | — | pendiente | pendiente (ver §4) | manual §3.4 paso 5; sin barra final |
| `⟨COMPAT_DATE⟩` | — | pendiente | pendiente (ver §4) | se confirma al crear cada wrangler.jsonc; propuesta del manual §0.1: 2026-10-06 |
| `⟨STORAGE⟩` | no aplica | no aplica | no aplica | solo si la app guarda archivos; propuesta: mudanzapp-staging |

## 4. Valores pendientes al momento del snapshot

Se obtienen en remoto y se confirman a mano, siguiendo el
[`manual`](../.plans/manual-setup-workspace-local-y-remoto.md) §3. `pending` describe lo que este
generador **no puede derivar** del nombre público; no afirma que el hecho siga sin conocerse. La
fuente viva de los hechos observados es [`workspace-env.md`](workspace-env.md) §5, que este
snapshot no duplica.

| Marcador | Se obtiene en | Nota |
| --- | --- | --- |
| `BACKEND_HOST` | manual §3.4 (dominio público de Railway) | se necesita antes de construir los Workers; sin barra final |
| `APP_BASE_URL` | manual §3.6 | todos los orígenes de los Workers, separados por comas; se completa al final |
| `COMPAT_DATE` | manual §3.5 y plantilla §0 | una fecha por wrangler.jsonc, en formato YYYY-MM-DD |
| `GIT_REMOTE_URL` | manual §3.1 | owner y URL del repositorio; el nombre del repo sí se deriva del nombre público |
| `WORKERS_DEV_SUBDOMAIN` | manual §3.5 | subdominio de workers.dev donde cuelga cada WORKER_NAME |
| `NEON_ROLE` | manual §3.2 | rol existente del proyecto Neon (por ejemplo neondb_owner); no se deriva |
| `STORAGE` | manual §3.3 | no aplica en el bootstrap; sin capacidad de archivos no hay bucket ni token |

## 5. Invariantes verificadas por el generador

| # | Invariante | Cumple |
| --- | --- | --- |
| I1 | APP_SLUG cumple /^[a-z][a-z0-9]{1,31}$/ | sí |
| I2 | NPM_SCOPE es "@" + APP_SLUG | sí |
| I3 | DB_TEST es DB_DEV + "_test" | sí |
| I4 | DB_DEV_BRANCH es DB_DEV + "_branch" | sí |
| I5 | DB_DEV_BRANCH_TEST es DB_DEV_BRANCH + "_test" | sí |
| I6 | toda base de prueba termina en _test y no se sufija dos veces | sí |
| I7 | hay un WORKER_NAME por frontend y ninguno se repite | sí |
| I8 | cada WORKER_NAME empieza por APP_SLUG | sí |
| I9 | los nombres de paquete son únicos | sí |
| I10 | el prefijo de localStorage termina en "." | sí |
| I11 | cada base local termina en _test o es la principal o la dev branch | sí |

## 6. Contrato técnico derivado

### 6.1 Paquetes (npm workspaces)

| Paquete | Nombre |
| --- | --- |
| raíz (privado) | `mudanzapp` |
| shared | `@mudanzapp/shared` |
| backend | `@mudanzapp/backend` |
| `frontend` | `@mudanzapp/frontend` |
| `wiki` | `@mudanzapp/wiki` |

### 6.2 Workers (uno por frontend)

| Frontend | `WORKER_NAME` | URL | Estado |
| --- | --- | --- | --- |
| `frontend` | `mudanzapp` | pending (manual §3.5) | pending |
| `wiki` | `mudanzapp-wiki` | pending (manual §3.5) | pending |

- La URL de cada Worker fue un hecho de plataforma: el snapshot la deja `pending` porque no
  puede derivarla, y el valor observado vive en [`workspace-env.md`](workspace-env.md) §5.
- El `name` del dashboard **debe coincidir** con el de su `wrangler.jsonc` o el build falla.
- El primer frontend toma el slug; los demás, `<slug>-<fe>`.

### 6.3 Convenciones

- Prefijo de claves de `localStorage`: `mudanzapp.`
- Punteros de documentos (se renombran al copiar): `resumen-funcional-app-mudanzapp.md`, `stack-tecnologico-app-mudanzapp.md`, `modelo-datos-app-mudanzapp.md`, `decisiones-tecnicas-app-mudanzapp.md`
- Almacenamiento: no aplica — el bootstrap no declara capacidad de archivos. Si aparece, `mudanzapp-staging`.

## 7. SQL listo para pegar

### 7.1 Local (rol no superusuario y cuatro bases)

```sql
CREATE ROLE mudanzapp LOGIN;
CREATE DATABASE mudanzapp OWNER mudanzapp;
CREATE DATABASE mudanzapp_test OWNER mudanzapp;
CREATE DATABASE mudanzapp_branch OWNER mudanzapp;
CREATE DATABASE mudanzapp_branch_test OWNER mudanzapp;
```

- Ejecutar sin `BEGIN`: `CREATE DATABASE` no corre dentro de una transacción.
- Fijar la contraseña con `\password <rol>` dentro de `psql`, nunca en la línea de comandos.
- `psql` y `createdb` no están en el `PATH`; usar la ruta del binario (manual §2.2).

### 7.2 Neon (mismo host, sin ramas de Neon)

```sql
CREATE DATABASE mudanzapp OWNER neondb_owner;
CREATE DATABASE mudanzapp_branch OWNER neondb_owner;
```

- `neondb_owner` es el rol existente del proyecto; no se deriva (manual §3.2).
- La dev branch remota es una **base más** en el mismo host: una rama de Neon cambia el host
  y rompe la derivación `_branch`.
- `mudanzapp_test` y `mudanzapp_branch_test` son local-only: no se crean en remoto.

## 8. Variables de entorno: solo nombres

Ningún valor se escribe aquí. El nombre de la base aparece en la ruta de la cadena, y la
contraseña **nunca** se escribe en este archivo ni se imprime.

| Archivo | Variable | Forma |
| --- | --- | --- |
| `backend/.env.local` | `DATABASE_URL` | `postgresql://mudanzapp:<password>@localhost:5432/mudanzapp` |
| `backend/.env.local` | `PORT` | opcional, default 3000 |
| `backend/.env.local` | `NODE_ENV` | opcional, default `development` |
| `backend/.env.migration.local` | `DATABASE_URL` | cadena **directa** de Neon; solo comandos remotos |

- Una variable vacía cuenta como ausente; `dotenv` está prohibido; se carga con
  `--env-file-if-exists=.env.local`.
- Si la contraseña contiene `@`, `:`, `/`, `?` o `#`, se codifica con percent-encoding.
- La URL de pruebas y las de la dev branch se **derivan** (`_test`, `_branch`, `_branch_test`)
  y nunca se transportan ni se imprimen (`.roo/rules/07-secretos.md`).

## 9. Superficies del nombre público (`.guidelines/01` §3)

Inventario del renombrado público; la marca vive solo en la primera columna de consumo.
El `Estado` es el del momento del snapshot; la evidencia viva son `shared/src/brand.json`,
`shared/src/brand.ts` y `.scripts/generate-brand-index.mjs`
([`decisiones`](../.plans/decisiones-tecnicas-app-mudanzapp.md) §14.3).

| Superficie | Se consume en | Estado |
| --- | --- | --- |
| Título y metadatos | shared/src/brand.json -> brand.ts -> index.html | existe `publicName`; `.scripts/generate-brand-index.mjs` lo escribe en el artefacto |
| Manifest | shared/src/brand.json | pendiente de crear en Fase 2/3 |
| Copy de UI | brand.ts tipado; nunca cableado | pendiente del primer ciclo que toque UI |
| Correos | primera capacidad que envíe correo | fuera del bootstrap |
| Legales | documentos externos enlazados | fuera del bootstrap |
| Dominio y handles | externo; se planifican redirecciones | fuera del bootstrap |

## 10. Mapa de renombrado al copiar la plantilla

Tokens exactos del workspace de origen y todos los lugares que tocan. El reemplazo es
asistido, nunca a mano sobre el lockfile.

- Verificar el resultado con una búsqueda acotada (`git grep -n`), nunca con un comodín que
  indexe archivos ignorados.
- `package-lock.json` se regenera con `npm install`; editarlo a mano rompe la ortografía del
  scope.

### `MiApp` → `MudanzApp`

Naturaleza: pública.

- shared/src/brand.json (appName) y shared/src/brand.ts (acceso tipado)
- index.html de cada frontend (title) y metadatos
- manifest del frontend
- copy de UI que consuma brand
- e2e/ y specs que comparan texto visible
- prosa de .plans/

### `miapp` → `mudanzapp`

Naturaleza: interna.

- package.json raíz (name)
- SQL de rol y de las cuatro bases locales
- .roo/rules/04-verificacion.md (miapp_test, miapp_branch, miapp_branch_test)
- .roo/rules/06-datos.md (ejemplo de derivación _branch)
- name de cada wrangler.jsonc
- prefijo de claves de localStorage
- literales de e2e/support/harness.ts
- .plans/modelo-datos-app-miapp.md y demás punteros

### `@miapp` → `@mudanzapp`

Naturaleza: interna.

- package.json de shared, backend y cada frontend
- imports @miapp/shared en backend/src/app.ts y en el componente de estado
- comentarios y documentación técnica
- package-lock.json: se regenera con npm install, nunca se edita a mano

### `miapp-wiki` → `mudanzapp-wiki`

Naturaleza: interna.

- wiki/wrangler.jsonc
- dashboard de Cloudflare
- documentación de despliegue

### `*-app-miapp.md` → `*-app-mudanzapp.md`

Naturaleza: puntero.

- .plans/resumen-funcional-app-miapp.md
- .plans/stack-tecnologico-app-miapp.md
- .plans/modelo-datos-app-miapp.md
- .plans/decisiones-tecnicas-app-miapp.md
- citas en .roo/rules/01-scope.md y .roo/rules/00-stack.md
- citas en .roo/rules/05-deps.md y .roo/rules/06-datos.md
- tabla de .plans/indice-contexto.md

### `miapp-staging` → `mudanzapp-staging`

Naturaleza: interna.

- solo si aparece ⟨STORAGE⟩; hoy no hay capacidad de archivos

## 11. Qué hacer en la Fase 1

1. Leer este archivo junto con [`plantilla-inicializacion-workspace.md`](../.plans/plantilla-inicializacion-workspace.md) §0 y el
   [`manual`](../.plans/manual-setup-workspace-local-y-remoto.md) §0.1.
2. Pegar la tabla de §3 en §0 de la plantilla; es la instantánea de conveniencia, no la fuente.
3. Verificar colisión antes de scaffoldear: scope npm, nombre de Worker, nombre de repo y de rol.
4. Crear el rol y las cuatro bases con §7.1, y fijar la contraseña con `\password`.
5. Aplicar el mapa de §10 a lo copiado en la Fase 0, empezando por los punteros de `.plans/` y las
   citas de `.roo/rules/`; la copia del manifiesto y `git init` son de la Fase 0.
6. Regenerar este archivo y anotar las versiones de `Man-2.1`: es la evidencia versionada de la fase.
7. No dar por conocidos los valores de §4: se completan en su sección del manual.

## 12. Límites del script

- No verifica colisión real: `@mudanzapp` en npm, `mudanzapp` en Cloudflare y el repositorio
  exigen red y son pasos de la Fase 1.
- No crea credenciales, no lee `.env*`, no se conecta a nada y no imprime valores.
- No renombra el workspace: describe el renombrado y deja el reemplazo al ciclo que lo ejecute.
- No decide el nombre interno cuando cambia el público: el interno se fija aquí y se mantiene.
