# Auditoría de consistencia — MudanzApp (revisión 9)

> **Estado: auditoría ejecutada (2026-10-25, UTC).** Sustituye a la revisión 8, que quedó abierta con el marco fijado y sin ejecutar. Esta revisión **registra** hallazgos y preguntas; no corrige documentos (§9).
> **Autoridad:** `.guidelines/00`–`07` sobre reglas, planes y documentos de trabajo.
> **Criterios:** [`.plans/glosario-de-criterios.md`](glosario-de-criterios.md); esta revisión no los redefine.
> **Convención de referencias:** archivo y sección, sin anclas de línea (`glosario` §1.6).
> **Evidencia del ciclo:** textual —archivo y sección— más la lectura del árbol de artefactos. El gate **no** se ejecutó: ningún resultado de esta revisión es un veredicto de prueba.

## 1. Qué sustituye esta revisión

- Sustituye por completo a la revisión 8. Su premisa central —«solo hay documentos: no existen `package.json`, `README.md`, `shared/`, `backend/`, `frontend/`, `wiki/` ni `e2e/`»— dejó de ser cierta: el árbol contiene los siete, el runner de datos, el arnés e2e y el registro del primer bring-up remoto en [`.scripts/workspace-env.md`](../.scripts/workspace-env.md) §5.
- Se conserva lo que sigue vigente de la revisión 8: la línea base heredada (§2), los espacios de IDs (§3) y la regla de que un ID no se reutiliza ni se salta.
- No se reproduce la evidencia de las revisiones 5 a 7: ya no existe como documento y esta revisión no la reconstruye.
- No se reaudita ni se renumera `E3` ni `E5` (§2). El folder `plans` de la raíz queda declarado retirado y no se reintroduce.

## 2. Línea base heredada

Hay dos notas de excepción aprobadas en sus fuentes autoritativas. Esta revisión no las renumera, no las reaudita y no las modifica.

| Etiqueta | Qué es | Fuente autoritativa | Se cita desde |
| --- | --- | --- | --- |
| E3 | Una dependencia puede aterrizar en el mismo commit que el scaffold durante el bootstrap; desde el primer ciclo de producto va en su propio commit | [`.roo/rules/05-deps.md`](../.roo/rules/05-deps.md) §Dependencias | esa misma regla |
| E5 | `IF NOT EXISTS` cuando el DDL lo permite; si no, forma idempotente equivalente | [`.guidelines/04-datos-y-seguridad.md`](../.guidelines/04-datos-y-seguridad.md) §3 | [`.roo/rules/06-datos.md`](../.roo/rules/06-datos.md) §Datos y migraciones, [`stack-tecnologico-app-mudanzapp.md`](stack-tecnologico-app-mudanzapp.md) §5, [`modelo-datos-app-mudanzapp.md`](modelo-datos-app-mudanzapp.md) §7, [`decisiones-tecnicas-app-mudanzapp.md`](decisiones-tecnicas-app-mudanzapp.md) §14.1 y [`plantilla-inicializacion-workspace.md`](plantilla-inicializacion-workspace.md) Fase 4 |

## 3. Espacios de IDs

| Prefijo | Uso | Siguiente libre | Reservados |
| --- | --- | --- | --- |
| E | Excepciones aprobadas con nota en su fuente | E6 | `E3` y `E5`, heredados; no se reutilizan |
| G | Hallazgos que el ciclo corrige | G27 | `G12`–`G26`, de esta revisión |
| C | Preguntas abiertas | C11 | `C3`–`C10`, de esta revisión; todas quedaron resueltas (§7.1) y no se reutilizan |
| N | Retirado | no se usa | el espacio no se reabre |

Un ID no se reutiliza ni se salta. Si un hallazgo se cierra, se marca en su fila; el número no se libera.

## 4. Evidencia disponible

- Se leyeron los niveles 1 a 5 del `glosario` §1.1 y, además, cada artefacto del árbol: `package.json` raíz, `README.md`, `.gitignore`, `.prettierignore`, `eslint.config.js`, `tsconfig.base.json`, `shared/`, `backend/` (fuentes, `scripts/`, `sql/`, `test/`, `.env.example`), `frontend/`, `wiki/`, `e2e/`, `.roo/` y `.scripts/`.
- **«Aplicado»** significa coincidencia entre el texto vigente de la fuente y el artefacto que lo materializa; nunca «el archivo existe» por sí solo (`glosario` §1.7 y §1.8).
- Los documentos que citan resultados ya medidos (`README` §14, `.scripts/workspace-env.md` §1 y §2) se registran como evidencia **declarada**, no reproducida.
- No se consultó el historial de commits ni se ejecutó el gate; el estado de cada fase se clasifica por texto, no por log.
- Ninguna salida de esta revisión contiene valores de `.env*` ni cadenas de conexión.

## 5. Alcance ejecutado

- **Nivel 1:** `.guidelines/00`–`07`.
- **Nivel 2:** [`stack-tecnologico-app-mudanzapp.md`](stack-tecnologico-app-mudanzapp.md) y [`resumen-funcional-app-mudanzapp.md`](resumen-funcional-app-mudanzapp.md).
- **Nivel 3:** `.roo/rules/*` y `.roo/rules-orchestrator/*`.
- **Nivel 4:** [`decisiones-tecnicas-app-mudanzapp.md`](decisiones-tecnicas-app-mudanzapp.md) y [`modelo-datos-app-mudanzapp.md`](modelo-datos-app-mudanzapp.md).
- **Nivel 5:** [`plantilla-inicializacion-workspace.md`](plantilla-inicializacion-workspace.md), [`manual-setup-workspace-local-y-remoto.md`](manual-setup-workspace-local-y-remoto.md), `snippets-bootstrap.md` y `.scripts/*`.
- El artefacto **no es fuente**: se lee como el contraejemplo que hace visible una contradicción declarada por un nivel 2–5 (`glosario` §1.8).

## 6. Hallazgos

| ID | Hallazgo | Estado | Evidencia textual | Se corrige en |
| --- | --- | --- | --- | --- |
| G12 | [`decisiones-tecnicas-app-mudanzapp.md`](decisiones-tecnicas-app-mudanzapp.md) §14 mantiene 14.1, 14.2 y 14.3 como pre-decisiones «pendientes de crear en la Fase 4 / 2-3», pero los tres artefactos existen (`backend/src/errors.ts`, `backend/sql/001_init.sql`, `shared/src/brand.json` + `brand.ts`) y varias fuentes ya los citan como fuente vigente ([`stack`](stack-tecnologico-app-mudanzapp.md) §1, [`modelo-datos`](modelo-datos-app-mudanzapp.md) §1). El `glosario` §1.4 exige reemplazar la pre-decisión por el puntero al artefacto en cuanto existe. | Aplicada | `decisiones` §14; `glosario` §1.4; `stack` §1 | `decisiones` §14.1 y §14.2 (puntero); §14.3 ya estaba aplicada por `C5` |
| G13 | [`modelo-datos-app-mudanzapp.md`](modelo-datos-app-mudanzapp.md) §1 remite la creación del marcador a la pre-decisión §14.2 como si el archivo no existiera; `backend/sql/001_init.sql` existe y su contenido coincide con `modelo-datos` §7 (solo `CREATE SCHEMA IF NOT EXISTS app`, sin tablas de negocio). | Aplicada | `modelo-datos` §1 y §7; `decisiones` §14.2 | `modelo-datos` §1 |
| G14 | [`manual-setup-workspace-local-y-remoto.md`](manual-setup-workspace-local-y-remoto.md) `Man-0.2` afirma que «solo existen documentos y el generador» y que no hay `package.json`, `shared/`, `backend/`, `frontend/`, `wiki/`, `e2e/` ni repositorio local; el árbol contiene los seis y un `README.md` versionado que se declara fuente autoritativa de la operación. | Aplicada | `manual` `Man-0.2`; `README` encabezado | `manual` `Man-0.2` |
| G15 | `NODE_VERSION` tiene dos hechos contradictorios: `manual` `Man-2.1` paso 4 y [`.scripts/workspace-env.md`](../.scripts/workspace-env.md) §1 lo asignan a Railway; `manual` `Man-3.4` paso 3 declara que **no** se define porque no es una variable documentada por Railway. Como la única copia del contrato de despliegue es `Man-3.4` (`decisiones` §16), el registro apunta a un valor que su fuente dice no fijar. | Aplicada | `manual` `Man-2.1` y `Man-3.4`; `workspace-env` §1 | `workspace-env` §1 y `manual` `Man-2.1`, alineados a `Man-3.4`: solo Workers Builds |
| G16 | [`.scripts/workspace-params.md`](../.scripts/workspace-params.md) §3, §4, §6.2 y §9 mantienen `BACKEND_HOST`, `COMPAT_DATE`, las URLs de los Workers y las superficies de marca como `pending`, y su §4 afirma que «ningún artefacto puede darlos por conocidos»; `workspace-env` §5, `plantilla` §0, `manual` `Man-0.1` y `Man-3.5`, ambos `wrangler.jsonc` y ambos `environment.production.ts` los contienen. | Aplicada | `workspace-params` §3/§4/§6.2/§9; `workspace-env` §5; `plantilla` §0 | encabezado del generador y §3/§4/§6.2/§9 del snapshot; `workspace-env` §5 como fuente viva (`C7`) |
| G17 | `README` §4 afirma que en `environment.production.ts` el origen del backend `⟨BACKEND_HOST⟩` «queda pendiente hasta el bring-up remoto»; ambos `environment.production.ts` lo tienen cableado y el bring-up está cerrado (`workspace-env` §5). | Aplicada | `README` §4; `frontend/src/environments/environment.production.ts`; `wiki/src/environments/environment.production.ts` | `README` §4 |
| G18 | `backend/.env.example`, `README` §4 y `manual` `Man-2.4` listan `BACKEND_PUBLIC_URL` y `ADMIN_TOKEN` como variables de entorno, mientras `manual` `Man-0.5` y `Man-5.8` declaran que esas capacidades **no** se crean en el bootstrap, ningún módulo las lee y el propio `.env.example` dice que cada variable se añade con su capacidad. El `README` se contradice consigo mismo: §1 las excluye de local y §4 las tabula como `backend/.env.local`. | Aplicada | `.env.example`; `README` §1 y §4; `manual` `Man-0.5`, `Man-2.4`, `Man-3.4`, `Man-5.8` | `README` §1 y §4 y `manual` `Man-2.4` como inventario de nombres reservados (`C8`); `.env.example` conserva los nombres sin cambio |
| G19 | `decisiones` §12 describe [`.roo/rules/03-mcp.md`](../.roo/rules/03-mcp.md) como la regla que «nombra `cloudflare-docs` y `napkin-ai`»; la regla nombra además `railway` y [`.roo/mcp.example.json`](../.roo/mcp.example.json) declara los tres servidores. | Aplicada | `decisiones` §12; `.roo/rules/03-mcp.md`; `.roo/mcp.example.json` | `decisiones` §12 |
| G20 | El gate tiene dos definiciones: [`.roo/rules/04-verificacion.md`](../.roo/rules/04-verificacion.md) fija «siempre: `typecheck`, `lint`, `format:check`», mientras `manual` `Man-2.6` exige trece filas —con `typecheck:e2e` y los tres builds— y `plantilla` §7 y `README` §11 también los exigen. La regla es nivel 3 y el manual nivel 5: el inferior amplía el gate sin que el superior lo reconozca, y el nivel 3 declara ser el contrato de scripts. | Aplicada | `04-verificacion`; `manual` `Man-2.6`; `plantilla` §7; `README` §11 | `04-verificacion` con las condiciones por tipo de corte (`C6`); `Man-2.6`, `README` §11 y `plantilla` §7 rotulados como checklist |
| G21 | `plantilla` Fase 6 exige inyectar el entorno del backend en cada `webServer` de frontend («con `env: BACKEND_ENV`») y §2.1 nombra la constante `BACKEND_ENV`; [`e2e/playwright.config.ts`](../e2e/playwright.config.ts) declara que los frontends **no** heredan ese entorno —`ng serve` honra `PORT`— y [`e2e/support/harness.ts`](../e2e/support/harness.ts) expone `backendEnv()`, no una constante. `07` §7 manda corregir el documento cuando la corrida real lo contradice. | Aplicada | `plantilla` Fase 6 y §2.1; `e2e/playwright.config.ts`; `e2e/support/harness.ts` | `plantilla` (Fase 6 y §2.1) y la misma repetición en `snippets-bootstrap` §9 |
| G22 | `modelo-datos` §9.6 exige que el runner ejecute cada archivo «dentro de su propia transacción»; [`backend/scripts/migrate.ts`](../backend/scripts/migrate.ts) envía cada archivo con una sola `client.query()` y no emite `BEGIN`/`COMMIT`, de modo que la atomicidad depende del protocolo del driver y no del runner. La fuente única del modelo no se cumple por construcción. | Aplicada | `modelo-datos` §9.6; `backend/scripts/migrate.ts` | `migrate.ts` con transacción por archivo y guarda `migration-transaction-control` (`C9`); §9.6 no cambia |
| G23 | [`.scripts/sync-db-branch.sql`](../.scripts/sync-db-branch.sql) ejecuta `DROP DATABASE` y `pg_terminate_backend`; `.guidelines/04` §3 y [`.roo/rules/06-datos.md`](../.roo/rules/06-datos.md) prohibían `DROP` sin distinguir migraciones de helpers locales, y el único aval del helper era un comentario de [`.gitignore`](../.gitignore). **Decisión `C4` (§7.1), aplicada:** la prohibición se limita a las migraciones y el resto puede usar `DROP`. | Aplicada | `.guidelines/04` §3; `.roo/rules/06-datos.md`; `stack` §5; `modelo-datos` §7 y §9.3; `README` §7 | cerrado en este ciclo |
| G24 | El nombre público estaba cableado en `<title>MudanzApp</title>` de [`frontend/src/index.html`](../frontend/src/index.html) y [`wiki/src/index.html`](../wiki/src/index.html), además de `shared/src/brand.json`. **Decisión `C5` (§7.1), aplicada:** ambos `index.html` dejan el elemento de título vacío y [`.scripts/generate-brand-index.mjs`](../.scripts/generate-brand-index.mjs) escribe la marca en el artefacto construido; el criterio de crecimiento vive en `decisiones` §14.3.1. | Aplicada | `frontend/src/index.html`; `wiki/src/index.html`; `frontend/package.json`; `wiki/package.json`; `.scripts/generate-brand-index.mjs`; `decisiones` §14.3 | cerrado en este ciclo |
| G25 | `.wrangler/` existe en la raíz (estado local de Wrangler) y `.gitignore` no lo excluye; `manual` `Man-3.5` usa `npx wrangler dev` y `npx wrangler deploy`, que generan ese directorio en cada máquina. | Aplicada | `.wrangler/`; `.gitignore`; `manual` `Man-3.5` | `.gitignore` |
| G26 | Superficie declarada sin consumidor: `ERROR_CATALOG.not_found` y `backend/src/validation.ts` (`parseOrThrow`) no tienen ruta que los use, `shared` declara `zod` en `dependencies` sin exportar ningún esquema y `README` §1 presenta `shared/` como «tipos, esquemas `zod` y helpers». `02` §2 pide el contrato más delgado y `05-deps` que la dependencia compre un ciclo. | Aplicada | `backend/src/errors.ts`; `backend/src/validation.ts`; `shared/package.json`; `shared/src/index.ts`; `README` §1 | contrato mínimo acordado (`C10`) declarado en `errors.ts`, `validation.ts`, `decisiones` §14.1 y `README` §1 |

## 7. Preguntas abiertas

Las preguntas se numeran desde `C3`. Ninguna cambia documentos por sí sola (`glosario` §1.7, estado `Abierta`). `C3` a `C10` se resolvieron el 2026-10-25 y su registro vive en §7.1; los números no se reutilizan. La tabla conserva cada pregunta como se planteó y añade su resolución.

| ID | Pregunta | Fuentes en conflicto | Opciones | Resolución |
| --- | --- | --- | --- | --- |
| C6 | ¿Qué superficie tiene el gate? La regla omite dos filas que el manual y la plantilla exigen. | `04-verificacion`; `manual` `Man-2.6`; `plantilla` §7; `README` §11 | ampliar `04-verificacion` con `typecheck:e2e` y los builds, o recortar `Man-2.6` a lo que la regla nombra | La regla nombra las condiciones por corte; el manual, el `README` y la plantilla se rotulan como checklist completo |
| C7 | ¿Los hechos remotos ya observados entran al contrato generado o se quedan solo en `workspace-env` §5? | `workspace-params` §3/§4/§6.2/§9; `workspace-env` §5 | regenerar con los hechos observados, o declarar `workspace-env` §5 como única fuente y retirar del snapshot las frases de pendiente | El snapshot queda congelado en la Fase 1; `workspace-env` §5 es la fuente viva y `pending` significa «no derivable» |
| C8 | ¿Se conservan en `.env.example` los nombres de capacidades diferidas? | `.env.example`; `README` §4; `manual` `Man-0.5`/`Man-5.8` | conservarlos como inventario de nombres, o retirarlos hasta que exista su capacidad | Se conservan como inventario de nombres reservados, sin capacidad ni lector |
| C9 | ¿El runner emite transacción por archivo o el modelo describe lo que el runner garantiza? | `modelo-datos` §9.6; `backend/scripts/migrate.ts` | añadir `BEGIN`/`COMMIT` al runner, o reescribir `modelo-datos` §9.6 | Transacción por archivo en el runner con guarda de control propio; §9.6 no cambia |
| C10 | ¿Se poda la superficie sin consumidor o se declara contrato mínimo del humo? | `backend/src/errors.ts`; `backend/src/validation.ts`; `shared/package.json`; `README` §1 | podar hasta el primer corte con payload, o declararla contrato mínimo acordado | Se declara contrato mínimo acordado, con consumidor futuro nombrado |

### 7.1 Decisiones tomadas en este ciclo (2026-10-25)

| ID | Decisión del usuario | Consecuencia en las fuentes | Estado |
| --- | --- | --- | --- |
| C3 | `invite` se registra como **intención de futuro alcance**, no como capacidad core comprometida: su función es servir de criterio al evaluar caminos de implementación. | `decisiones` §11 deja de afirmar que está «declarada como capacidad core»; `resumen-funcional` §4 la registra como intención de futuro alcance, sin implementación ni alcance comprometido; `07-secretos` la conserva en el catálogo «cuando exista». | Aplicada: `decisiones` §11 y `resumen-funcional` §4 contienen la resolución |
| C4 | La prohibición de `DROP` se limita a las **migraciones** (`backend/sql/*.sql` aplicadas por el runner). Lo que no es migración —helpers locales, pasos manuales de consola— puede usar `DROP`. | `04` §3 y `06-datos` acotan la regla a las migraciones y conservan la condición de `E5`; `stack` §5, `modelo-datos` §7 y §9.3 y `README` §7 repiten el alcance acotado. `E5` no cambia y **no** se abre `E6`. | Aplicada: la regla y sus cinco repeticiones contienen el alcance acotado |
| C5 | Corte mínimo: los dos `index.html` no cablean la marca; `brand.json` es la fuente y el build escribe el título en el artefacto. La tabla de superficies futuras queda como criterio de crecimiento, no como campos por anticipado. | `decisiones` §14.3 (decisión aplicada) y §14.3.1 (criterio); `stack` §1 y §11; `README` §6 y §9; `plantilla` Fase 5; `.scripts/README.md`; ambos frontends (`index.html`, `package.json` y specs) | Aplicada: la marca entra al artefacto y el fuente no la contiene |
| C6 | El gate tiene una sola definición y es la regla: nombra `typecheck:e2e` al tocar `e2e/`, `build:web:<FE>` al tocar un frontend o `shared/` y `build` al tocar el backend. | `04-verificacion` gana tres filas condicionales y la nota de prevalencia sobre `Man-2.6`; `Man-2.6`, `README` §11 y `plantilla` §7 se rotulan como checklist completo | Aplicada: la regla y los tres documentos contienen el alcance |
| C7 | El snapshot generado se congela: el generador se corre en la Fase 1, antes del primer bring-up, y desde la primera fila observada en `workspace-env` §5 es evidencia del arranque, no fuente viva. `pending` pasa a significar «no derivable del nombre público». | Encabezado, §3, §4, §6.2 y §9 de `generate-workspace-params.mjs`; `.scripts/README.md` y `plantilla` §0 declaran la frontera; `workspace-env` §5 queda como única fuente viva | Aplicada: el snapshot regenerado declara su naturaleza y `workspace-env` §5 es la fuente viva |
| C8 | Se conservan `BACKEND_PUBLIC_URL` y `ADMIN_TOKEN` como inventario de nombres reservados, sin capacidad ni lector. | `README` §1 y §4 y `manual` `Man-2.4` los califican de reservados; `backend/.env.example` conserva los nombres sin cambio | Aplicada: los tres documentos distinguen reservado de obligatorio |
| C9 | El runner abre transacción por archivo y falla con código estable si el archivo trae control de transacción propio. Una sentencia no transaccional futura se aborda en el ciclo que la necesite, con su evidencia. | `backend/scripts/migrate.ts` envuelve cada archivo en `BEGIN`/`COMMIT` con `ROLLBACK` y guarda `migration-transaction-control`; `modelo-datos` §9.6 se cumple sin cambios | Aplicada: el runner controla la transacción y el documento no cambia |
| C10 | Se declara contrato mínimo acordado: `ERROR_CATALOG`, `parseOrThrow` y el `zod` de `shared` se conservan con consumidor futuro nombrado. | `decisiones` §14.1, `backend/src/errors.ts`, `backend/src/validation.ts` y `README` §1 | Aplicada: la superficie queda declarada y `README` §1 ya no promete esquemas inexistentes |

- `C3` no amplía alcance: no declara una capacidad implementable ni una garantía; fija un criterio de evaluación para el ciclo que la aborde.
- `C4` se aplica corrigiendo el alcance de la regla en su fuente autoritativa, que es la vía de `glosario` §1.2; no es una excepción de §1.3 y no necesita nota.
- `C4` conserva intactas las garantías de `04` §6: la rama principal no es un sandbox y el único camino autorizado contra el remoto sigue siendo el runner manual.

### 7.2 Desviación registrada en la corrida — la inyección corre sobre el artefacto

La propuesta inicial era inyectar con `indexHtmlTransformer` y, después, con un `index.input` apuntando a un HTML generado fuera de `src/`. La corrida contradijo las dos (`07` §7: se corrige el diseño, no se defiende):

1. `@angular/build/src/builders/application/schema.json` **no** expone `indexHtmlTransformer`; el campo existe solo como opción interna en `options.d.ts`. Declararlo en `angular.json` habría sido un contrato falso.
2. Un `index.input` en `frontend/.brand/index.html` rompe el build: `link.parentNode?.insertBefore is not a function`, tanto con `output` implícito como explícito.
3. El primer paso de inyección reemplazó desde el `<title>` **citado dentro de un comentario** del HTML y dejó el elemento real vacío: el artefacto quedó con el título dentro del comentario y sin `<title>` propio.

Diseño aprobado después de la corrección: el fuente conserva el elemento de título vacío y sin la marca en ningún comentario; `.scripts/generate-brand-index.mjs` corre después de `ng build` sobre `dist/<FE>/browser/index.html`; el script exige **exactamente un** elemento de título y falla con `brand-index-title-missing` o `brand-index-title-ambiguous`. Evidencia: ambos builds en verde y el artefacto de `frontend` con un solo `<title>MudanzApp</title>`.

## 8. Verificación de cierre

- [x] Cada hallazgo declara archivo y sección, y su estado sale de la taxonomía del `glosario` §1.7.
- [x] Los IDs continúan desde `G12` y `C3`, sin huecos ni reutilización.
- [x] El registro no menciona el folder `plans` de la raíz salvo para declararlo retirado.
- [x] No quedan anclas de línea: todas las referencias son archivo y sección.
- [x] Ninguna ruta de código se cita como fuente de alcance; se cita como contraejemplo de un hecho ya declarado.
- [x] Ninguna salida contiene valores de `.env*` ni cadenas de conexión.
- [x] Las decisiones de este ciclo quedaron registradas en §7.1 y **aplicadas** en sus fuentes: `C3`, `C4` y `C5`.
- [x] El gate proporcional del corte quedó en verde: `build:web:frontend`, `build:web:wiki`, `typecheck`, `lint`, `format:check`, `test:web:frontend` y `test:web:wiki`.
- [x] `C6`–`C10` resueltas en §7.1 y aplicadas en sus fuentes; `G12`–`G22` y `G25`–`G26` aplicados y marcados.

## 9. Registro del ciclo de ejecución

- Reemplazado este archivo por completo (revisión 9) con el estado real del árbol: código, datos, arnés, despliegue y registro remoto.
- Se ejecutó la lectura de los niveles 1 a 5 y del árbol de artefactos. **No** se ejecutó el gate ni se consultó el historial de commits: la evidencia de este ciclo es documental y se declara como tal.
- Registradas y aplicadas las tres decisiones del ciclo (§7.1): `C3` en `decisiones` §11 y `resumen-funcional` §4; `C4` en `04` §3, `06-datos`, `stack` §5, `modelo-datos` §7 y §9.3 y `README` §7; `C5` en ambos `index.html`, `package.json`, specs, `decisiones` §1/§13/§14.3, `stack` §1/§11, `README` §6/§7/§9, `plantilla` Fase 5 y `.scripts/README.md`.
- Artefacto nuevo del ciclo: `.scripts/generate-brand-index.mjs`, con códigos estables y sin lectura de `.env*`.
- Evidencia ejecutable (2026-10-25): `build:web:frontend` y `build:web:wiki` en verde con `brand:index`; el artefacto de `frontend` contiene un único `<title>MudanzApp</title>`; `typecheck`, `lint`, `format:check`, `test:web:frontend` y `test:web:wiki` en verde.
- No se ejecutaron `test:api`, `test:api:db` ni `test:e2e`: el corte no toca backend, base ni arnés, y el arnés exige migraciones manuales y puertos libres (`06` §2 y §4 de `.guidelines/06`).
- **Ciclo de corrección (2026-10-25):** aplicados `G12`–`G22`, `G25` y `G26` con las decisiones `C6`–`C10` de §7.1. El generador de parámetros se regeneró y se verificó idempotente (hash idéntico en dos corridas). El gate proporcional de este corte es el de `.roo/rules/04-verificacion.md` y su evidencia se registra en el commit del ciclo.
- Sin commit registrado aquí: los commits del ciclo de corrección se dejan al cierre conforme a `.roo/rules/02-commits.md`.
