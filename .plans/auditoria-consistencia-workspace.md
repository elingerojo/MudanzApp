# Auditoría de consistencia — MudanzApp (revisión 11)

> **Estado: auditoría ejecutada y reevaluada (2026-10-25, UTC).** Sustituye a la revisión 10. La
> revisión 10 preguntó cinco cosas que el workspace **ya había contestado**: donde el diseño está
> implementado, su forma es la decisión y el documento que la contradice es el que se corrige. Esta
> revisión aplica ese criterio, retira la pregunta que no tenía objeto y **cierra las cinco preguntas
> abiertas sin dejar ninguna pendiente de decisión**.
> **Autoridad:** `.guidelines/00`–`07` sobre reglas, planes y documentos de trabajo.
> **Criterios:** [`.plans/glosario-de-criterios.md`](glosario-de-criterios.md); esta revisión no los redefine.
> **Convención de referencias:** archivo y sección, sin anclas de línea (`glosario` §1.6).
> **Evidencia del ciclo:** textual —archivo y sección— más la lectura completa del árbol de
> artefactos. El gate **no** se ejecutó y el historial de commits **no** se consultó.

## 1. Qué sustituye esta revisión

- Sustituye por completo a la revisión 10. Su lectura del árbol fue correcta; su **marco de decisión**
  no: registró como preguntas cinco hechos que ya tienen una forma implementada y estable.
- La regla nueva, que esta revisión aplica y la 10 no tenía:

  1. Los niveles 1 a 4 siguen mandando: ningún artefacto puede contradecirlos.
  2. Los niveles 5 y 6 —plantilla, manual, snippets, glosario y estas auditorías— **describen** la
     implementación. Cuando dejan un diseño abierto y el árbol ya materializó una forma, **esa forma
     es la decisión** y se corrige el documento hacia ella, no al revés.
  3. Un comentario dentro de un artefacto que nombra un símbolo que el propio artefacto no exporta,
     o que llama «pendiente» a algo ya construido, **no es una decisión de diseño**: es un defecto
     de redacción del archivo y se corrige ahí.

- Consecuencia: `C12` y `C15` de la revisión 10 quedan resueltas por el estado del árbol; `C11`,
  `C13` y `C14` también, porque el árbol ya eligió. **No queda ninguna pregunta abierta.**
- Se conserva de la revisión 9 lo que sigue vigente: la línea base heredada (§2), los espacios de IDs
  (§3) y la regla de que un ID no se reutiliza ni se salta. No se reaudita `E3` ni `E5`, ni se
  reabren `G12`–`G26` ni `C3`–`C10`.

## 2. Línea base heredada

Hay dos notas de excepción heredadas y una tercera asignada **después** de esta revisión. Las tres
viven en sus fuentes autoritativas; esta revisión no renumera, ni reaudita, ni modifica las dos
heredadas.

| Etiqueta | Qué es | Fuente autoritativa | Se cita desde |
| --- | --- | --- | --- |
| E3 | Una dependencia puede aterrizar en el mismo commit que el scaffold durante el bootstrap; desde el primer ciclo de producto va en su propio commit | [`.roo/rules/05-deps.md`](../.roo/rules/05-deps.md) §Dependencias | esa misma regla |
| E5 | `IF NOT EXISTS` cuando el DDL lo permite; si no, forma idempotente equivalente | [`.guidelines/04-datos-y-seguridad.md`](../.guidelines/04-datos-y-seguridad.md) §3 | [`.roo/rules/06-datos.md`](../.roo/rules/06-datos.md) §Datos y migraciones, [`stack-tecnologico-app-mudanzapp.md`](stack-tecnologico-app-mudanzapp.md) §5, [`modelo-datos-app-mudanzapp.md`](modelo-datos-app-mudanzapp.md) §7, [`decisiones-tecnicas-app-mudanzapp.md`](decisiones-tecnicas-app-mudanzapp.md) §14.1 y [`plantilla-inicializacion-workspace.md`](plantilla-inicializacion-workspace.md) Fase 4 |
| E6 | La ruta automática no destruye; la contracción vive en `backend/sql/contract/` y `_test` y `_branch` son sandboxes desechables | [`.guidelines/04-datos-y-seguridad.md`](../.guidelines/04-datos-y-seguridad.md) §3 | [`.roo/rules/06-datos.md`](../.roo/rules/06-datos.md) §Datos, [`stack-tecnologico-app-mudanzapp.md`](stack-tecnologico-app-mudanzapp.md) §Migraciones, [`modelo-datos-app-mudanzapp.md`](modelo-datos-app-mudanzapp.md) §7 y §9, y [`README.md`](../README.md) §7 |

## 3. Espacios de IDs

| Prefijo | Uso | Siguiente libre | Reservados |
| --- | --- | --- | --- |
| E | Excepciones aprobadas con nota en su fuente | E7 | `E3` y `E5`, heredados; `E6`, asignada después de esta revisión; no se reutilizan |
| G | Hallazgos que el ciclo corrige | G40 | `G12`–`G26` (rev. 9, aplicados), `G27`–`G39` (esta revisión; `G34` queda **retirada**) |
| C | Preguntas abiertas | C16 | `C3`–`C10` (rev. 9, resueltas) y `C11`–`C15` (rev. 10, **resueltas por el estado del workspace** en §7.1) |
| N | Retirado | no se usa | el espacio no se reabre |

Un ID no se reutiliza ni se salta. Si un hallazgo se cierra, se marca en su fila; el número no se
libera.

## 4. Evidencia disponible

- Se releyeron los niveles 1 a 5 y **cada artefacto del árbol**: `package.json` raíz y los cuatro
  `package.json` de workspace, `README.md`, `.gitignore`, `.gitattributes`, `.editorconfig`,
  `.prettierignore`, `eslint.config.js`, `tsconfig.base.json`, `shared/` (fuentes y
  `tsconfig.build.json`), `backend/` (fuentes, `scripts/`, `sql/`, `test/`, `.env.example`),
  `frontend/` y `wiki/` (config del CLI, `wrangler.jsonc`, `environments`, `index.html`, componentes
  y specs), `e2e/` (config, envoltorio, `global-setup`, `harness`, `smoke.spec`, `tsconfig`), `.roo/`
  (reglas, `rules-architect`, `rules-orchestrator`, `mcp.example.json`) y `.scripts/` (generadores,
  snapshot, registro y helpers locales).
- **«Aplicado»** significa coincidencia entre el texto vigente de la fuente y el artefacto que lo
  materializa; nunca «el archivo existe» por sí solo (`glosario` §1.7 y §1.8).
- **Criterio «reproducible»:** un documento de arranque es reproducible cuando un tercero puede
  ejecutar sus instrucciones **sin el workspace de origen**. Se evalúa sobre el manifiesto
  (`plantilla` §12) y sobre el catálogo de acciones (`manual`).
- **Criterio de desempate (nuevo, §1.2):** con los niveles 1–4 intactos, la forma implementada en el
  árbol resuelve la pregunta que solo plantean los niveles 5 y 6. No se usa para invertir jerarquía:
  se usa para no preguntar lo que ya está construido.
- Los documentos que citan resultados ya medidos (`README` §14, `.scripts/workspace-env.md` §1, §2 y
  §5) se registran como evidencia **declarada**, no reproducida.
- No se ejecutó el gate; el estado de cada fase se clasifica por texto, no por log.
- Ninguna salida de esta revisión contiene valores de `.env*` ni cadenas de conexión.

## 5. Alcance ejecutado

- **Nivel 1:** `.guidelines/00`–`07`.
- **Nivel 2:** [`stack-tecnologico-app-mudanzapp.md`](stack-tecnologico-app-mudanzapp.md) y [`resumen-funcional-app-mudanzapp.md`](resumen-funcional-app-mudanzapp.md).
- **Nivel 3:** `.roo/rules/*`, `.roo/rules-orchestrator/*` y `.roo/rules-architect/*`.
- **Nivel 4:** [`decisiones-tecnicas-app-mudanzapp.md`](decisiones-tecnicas-app-mudanzapp.md) y [`modelo-datos-app-mudanzapp.md`](modelo-datos-app-mudanzapp.md).
- **Nivel 5:** [`plantilla-inicializacion-workspace.md`](plantilla-inicializacion-workspace.md), [`manual-setup-workspace-local-y-remoto.md`](manual-setup-workspace-local-y-remoto.md), [`snippets-bootstrap.md`](snippets-bootstrap.md) y `.scripts/*`.
- El artefacto **no es fuente de alcance** (`glosario` §1.8); sí es la **forma vigente** de lo que un
  nivel 5 o 6 deja abierto (§4, criterio de desempate).

### 5.1 Respuesta directa: ¿falta algo por implementar?

**No falta ninguna implementación.** La revisión 10 respondió «sí» por un solo caso —el subpath de
`shared`— y ese caso **no es una implementación faltante**: es una frase de la plantilla sin respaldo
en el stack ni en el diseño. Las cinco fases de construcción tienen su artefacto y la Fase 8 está
cerrada con sus valores observados en `.scripts/workspace-env.md` §5.

Lo que falta es **cobertura documental**: siete huecos del manifiesto y del catálogo de consolas, y
dos restos de redacción dentro de artefactos.

| Clase | Qué | Dónde |
| --- | --- | --- |
| El árbol tiene algo que **ningún inventario cubre** | `.scripts/` (dos generadores, el snapshot, el registro y su README) y `.roo/rules-architect/` | `G28` · `G36` |
| El árbol tiene algo que **ningún documento de nivel 5 describe** | El mecanismo que separa `test:api` de `test:api:db` | `G38` |
| El manifiesto **no incluye** documentos versionados | `glosario-de-criterios.md` y esta auditoría | `G37` |
| El manifiesto **describe mal** lo que hay | El contenido de `shared/src/index.ts`; la ruta de `vitest.config.ts` | `G29` · `G30` |
| El manual **describe mal** el árbol y el checklist | `.scripts/` en `Man-0.2`; la fila `npm run test` ausente en `Man-2.6` | `G27` · `G35` |
| La plantilla **declara un diseño que no existe** | El subpath de valores de runtime de `shared` | `G31` |
| **Restos de redacción** dentro de artefactos | `BACKEND_ENV` en los comentarios del arnés; «pre-decisión §14.2» en el marcador SQL | `G32` · `G33` |
| Un **nivel 2** cita como pre-decisión algo ya construido | `stack` §11, fila de errores, sobre `decisiones` §14.1 | `G39` |

## 6. Hallazgos

| ID | Hallazgo | Estado | Evidencia textual | Se corrige en |
| --- | --- | --- | --- | --- |
| G27 | `manual` `Man-0.2` describe `.scripts/` como el directorio que contiene «el generador de parámetros, el runner de datos y el arnés». El árbol tiene en `.scripts/` el generador de parámetros, el de la marca, el snapshot, el registro del entorno y su `README.md`; el **runner de datos** vive en `backend/scripts/*` y el **arnés** en `e2e/`. La descripción no coincide con el árbol y omite `generate-brand-index.mjs`, que es el que sostiene `brand:index`. | Aplicada | `manual` `Man-0.2`; `.scripts/*`; `backend/scripts/*`; `e2e/` | `manual` `Man-0.2` |
| G28 | `.scripts/` **no existe** en la estructura objetivo (`plantilla` §3) ni en el manifiesto (§12). Sus dos generadores son dependencias duras del arranque: la Fase 1 manda regenerar `.scripts/workspace-params.md` y la Fase 5 manda `brand:index` al final del `build` de cada `⟨FE⟩`, que los dos `package.json` implementan como `node ../.scripts/generate-brand-index.mjs`. Además `.prettierignore` ignora solo el par generado y `eslint.config.js` declara que `eslint .` cubre `.scripts/`, así que el directorio es parte del repo y no un artefacto local. El directorio existe y está en uso: la forma es la decisión. | Aplicada | `plantilla` §3, §12 y Fase 1/Fase 5; `frontend/package.json`; `wiki/package.json`; `.prettierignore`; `eslint.config.js` | `plantilla` §3 y §12 |
| G29 | `plantilla` §12, fila *Humo*, manda escribir `shared/src/index.ts` «(podado a `health`)». El contrato implementado exporta además `brand` y `Brand` desde `shared/src/brand.ts`, y la propia Fase 3 los declara como entregable; los dos frontends consumen `brand` por la raíz. El manifiesto describe un contrato anterior al de la decisión `C5`. | Aplicada | `plantilla` §12 y Fase 3; `shared/src/index.ts`; `shared/src/brand.ts`; `frontend/src/app/app.ts`; `wiki/src/app/app.ts` | `plantilla` §12 |
| G30 | `plantilla` §12, fila *Tooling*, lista `vitest.config.ts` sin ruta, y §5 lo presenta como un snippet más. El árbol tiene **tres** configuraciones, una por workspace (`backend/`, `frontend/`, `wiki/`) y **ninguna** en la raíz; `snippets-bootstrap.md` §2 ya la nombra `backend/vitest.config.ts`. La fila no dice qué copiar ni dónde, y la forma implementada es una config por workspace. | Aplicada | `plantilla` §5 y §12; `snippets-bootstrap` §2; `backend/vitest.config.ts`; `frontend/vitest.config.ts`; `wiki/vitest.config.ts` | `plantilla` §5 y §12 |
| G31 | `plantilla` §2.1 exige que «los valores de runtime vayan por **subpath sin `zod`**» y la Fase 3 dice que «los subpaths sin `zod` se declaran **cuando exista** el módulo». El diseño implementado es **un solo punto de entrada**: `shared/package.json` exporta `"."`, los dos frontends importan `brand` por ahí y `zod` no se importa en ninguna parte del grafo. La frase no tiene respaldo en `stack` §2 —que no menciona subpaths— y describe un mecanismo que no existe. El riesgo que la frase quería evitar es real y tiene disparador ya escrito: el día que la raíz exporte un esquema `zod`, el navegador lo arrastraría (`README` §1 y `shared/src/index.ts` anuncian ese momento). | Aplicada (`C12` resuelta por el estado) | `plantilla` §2.1 y Fase 3; `stack` §2; `shared/package.json`; `shared/src/index.ts`; `README` §1; `frontend/src/app/app.ts` | `plantilla` §2.1 y Fase 3 |
| G32 | Resto del contrato corregido por `G21`: `plantilla` §2.1 y `snippets` §9 ya hablan de **`backendEnv()`, una función y no una constante**, pero [`e2e/support/harness.ts`](../e2e/support/harness.ts) seguía diciendo «Aquí solo se compone `BACKEND_ENV`» y [`e2e/playwright.config.ts`](../e2e/playwright.config.ts) «Los frontends **no** heredan `BACKEND_ENV`». El archivo exporta la función; los comentarios nombraban una constante que no existe. No es una decisión de diseño: es un defecto de redacción del artefacto. | Aplicada (cosmético) | `plantilla` §2.1; `snippets-bootstrap` §9; `e2e/support/harness.ts`; `e2e/playwright.config.ts` | comentarios de `e2e/support/harness.ts` y `e2e/playwright.config.ts` |
| G33 | [`backend/sql/001_init.sql`](../backend/sql/001_init.sql) se autodenominaba «marcador idempotente de la capa de datos (pre-decisión §14.2)», mientras `decisiones` §14 declara que §14.1 y §14.2 «pasan a puntero» al artefacto (`G12` y `G13`, aplicados). El artefacto no puede seguir citándose como pendiente (`glosario` §1.4). | Aplicada (cosmético) | `backend/sql/001_init.sql`; `decisiones` §14; `glosario` §1.4 | comentario de cabecera de `backend/sql/001_init.sql` |
| G34 | **Retirada.** La revisión 10 registró que `dev:web:wiki` no fija puerto y que `README` §5, `Man-2.5` y el arnés usan `4201`. El alias genérico `dev:web:⟨FE⟩` es la forma que publica `plantilla` §6 y la que implementan los dos workspaces; el puerto del segundo frontend se documenta como argumento explícito en los tres sitios que lo necesitan, y el arnés lo pasa en el comando. No hay nada que corregir: se retira el hallazgo y con él la pregunta `C15`. | Retirada | `package.json`; `snippets-bootstrap` §1; `README` §5; `manual` `Man-2.5`; `e2e/support/harness.ts`; `plantilla` §6 | — (sin cambio) |
| G35 | `manual` `Man-2.6` se declara «checklist completo del arranque» y no incluía `npm run test`, que `README` §11 sí tabula como «Unitarios» y que la Fase 7 de la plantilla incluye en su verificación. El script existe en la raíz; los dos documentos que se presentan como checklist completo no coincidían en una fila. | Aplicada | `manual` `Man-2.6`; `README` §11; `plantilla` Fase 7; `package.json` | `manual` `Man-2.6` |
| G36 | [`.roo/rules-architect/00-planning-context.md`](../.roo/rules-architect/00-planning-context.md) existe **fuera del versionado y de todos los inventarios**, y eso es coherente con cuatro fuentes que lo decidieron así: `.gitignore` des-ignora solo `.roo/rules/` y `.roo/rules-orchestrator/`; `plantilla` §2.2 dice que las definiciones de modo viven fuera del workspace; el encabezado del `manual` repite la misma pareja; `indice-contexto` declara «siempre activo: `.roo/rules/*`». Es una regla **de modo**, local a la máquina. El defecto estaba en el otro lado: `glosario` §Fuente única la citaba como una de las dos fuentes que **exigen** la plantilla de nota de excepción (§1.5), y presentaba como requisito versionado lo que vive en un archivo no versionado. | Aplicada (`C11` resuelta por el estado) | `.roo/rules-architect/00-planning-context.md`; `.gitignore`; `plantilla` §2.2; `manual` encabezado; `indice-contexto` §Documentos; `glosario` §1.1 y §Fuente única; `.roo/rules/01-scope.md` §Alcance | `glosario` §Fuente única |
| G37 | [`glosario-de-criterios.md`](glosario-de-criterios.md) y esta auditoría están en `.plans/`, `indice-contexto` los declara **versionados** y el nivel 3 depende de las plantillas del glosario; ninguna de las dos aparecía en el manifiesto (`plantilla` §12): la fila *Manual* listaba plantilla, manual, snippets e `indice-contexto`, y la fila *Memory-bank* listaba `stack`, `resumen-funcional`, `decisiones` y `modelo-datos`. El manifiesto quedaba por debajo de lo que `indice-contexto` ya reconoce como versionado. | Aplicada | `plantilla` §12; `indice-contexto` §Documentos; `glosario` §Fuente única; `.roo/rules/01-scope.md` §Alcance | `plantilla` §12 |
| G38 | La separación entre `test:api` y `test:api:db` depende de un mecanismo que **ningún documento de nivel 5 nombraba**: [`backend/vitest.config.ts`](../backend/vitest.config.ts) excluye `test/db/**` salvo que `MUDANZAPP_DB_TESTS === '1'`, y [`backend/scripts/test-db.ts`](../backend/scripts/test-db.ts) es quien define la variable y deriva la URL. `plantilla` §2.1 y §3 describen el runner y los scripts, y `Man-2.6` solo advierte «las suites no migran». Quien reconstruya el workspace desde los documentos podía escribir un `vitest.config.ts` que corra las suites con base dentro de `test:api`, que entonces exige una base migrada y deja de ser la corrida barata en frío que `README` §6 promete. | Aplicada | `backend/vitest.config.ts`; `backend/scripts/test-db.ts`; `plantilla` §2.1 y §3; `manual` `Man-2.6`; `README` §6 | `plantilla` §2.1 y `snippets` §2 |
| G39 | [`stack`](stack-tecnologico-app-mudanzapp.md) §11, fila *Códigos de error y evidencia de fallos*, remitía a «`decisiones-tecnicas-app-mudanzapp.md` §14.1 (pre-decisión de errores)»; `decisiones` §14 declara que «§14.1 y §14.2 pasan a puntero» y `backend/src/errors.ts` existe. Es un nivel 2 citando como pendiente un hecho ya construido, y el nivel 2 es el que fija el CÓMO: la cita arrastra a todo documento que lo lea. | Aplicada | `stack` §11; `decisiones` §14 y §14.1; `backend/src/errors.ts` | `stack` §11 |

## 7. Preguntas abiertas

**Ninguna.** Las cinco preguntas de la revisión 10 quedan resueltas por el estado del workspace
(§7.1) y sus números no se reutilizan. La siguiente pregunta libre es `C16`.

### 7.1 Decisiones tomadas por el estado del workspace (2026-10-25)

| ID | Pregunta de la revisión 10 | Forma ya implementada | Consecuencia en las fuentes | Estado |
| --- | --- | --- | --- | --- |
| C11 | ¿`.roo/rules-architect/` se versiona o se declara local? | Local y fuera del versionado: `.gitignore` solo des-ignora `rules/` y `rules-orchestrator/`, y `plantilla` §2.2, el encabezado del `manual` e `indice-contexto` dicen lo mismo. Es una regla de modo, no una regla del workspace. | Se corrige solo el `glosario` §Fuente única: el requisito de la nota de excepción se cita en `01-scope` §Alcance, que sí es versionado, y la regla del Architect queda mencionada como refuerzo local, nunca como fuente. `.gitignore`, `plantilla`, `manual` e `indice-contexto` no cambian. | Resuelta |
| C12 | ¿El subpath de `shared` se implementa ahora o se posterga? | Un solo punto de entrada: `exports` solo tiene `"."`, `zod` está en `dependencies` y no se importa, y los dos frontends consumen `brand` por la raíz. `stack` §2 no pide subpaths. | `plantilla` §2.1 y Fase 3 se reescriben a la forma vigente: raíz única, `zod` en `dependencies` usado en la frontera del backend, y el subpath se crea **en el mismo ciclo** que exporte el primer esquema `zod` desde la raíz. El disparador ya está escrito en `README` §1 y en `shared/src/index.ts`. | Resuelta |
| C13 | ¿El glosario y la auditoría entran al manifiesto? | Ambos existen y `indice-contexto` los declara versionados; el nivel 3 depende de las plantillas del glosario. | `plantilla` §12 gana el glosario en la fila *Manual* y esta auditoría en *Memory-bank* como patrón opcional. | Resuelta |
| C14 | ¿Se documenta el mecanismo que separa `test:api` de `test:api:db`? | Implementado: `backend/vitest.config.ts` excluye `test/db/**` salvo `MUDANZAPP_DB_TESTS=1`, que define `backend/scripts/test-db.ts` junto con la URL derivada. | `plantilla` §2.1 y `snippets` §2 describen la variable, quién la define y por qué `test:api` no toca la base. | Resuelta |
| C15 | ¿Qué se hace con `dev:web:wiki`, que no fija puerto? | El alias genérico `dev:web:⟨FE⟩` es la forma de `plantilla` §6 y la de los dos workspaces; el `4201` se pasa explícito donde se necesita (`README` §5, `Man-2.5`, arnés). | Sin cambio en documentos ni en código. El hallazgo `G34` se retira. | Resuelta (sin acción) |

- Ninguna de las cinco resuelve contra los niveles 1 a 4: `stack` no menciona subpaths ni el puerto del
  segundo frontend, `stack` §8 ya fija `globals`/`threads`/`fileParallelism` como los implementa el
  árbol, y `.roo/rules/*` no se pronuncia sobre la versionabilidad de una regla de modo. El criterio de
  desempate se aplicó donde correspondía y no invirtió jerarquía.
- Si el usuario prefiere otra forma, el cambio es pequeño y está identificado: versionar la regla del
  Architect es una línea en `.gitignore` más cuatro menciones; implementar el subpath es un `exports`
  y dos imports. Esta revisión no las ejecuta porque el árbol ya eligió.

### 7.2 Estado de las preguntas de la revisión 9

`C3`–`C10` quedaron resueltas y aplicadas (§7.1 de la revisión 9). Esta revisión **no** las reabre;
solo deja constancia de que `C7` (snapshot congelado) sigue vigente y se cumple:
`.scripts/workspace-params.md` deja los hechos remotos como `pending` y `.scripts/workspace-env.md` §5
es la fuente viva.

## 8. Verificación de cierre

- [x] Cada hallazgo declara archivo y sección, y su estado sale de la taxonomía del `glosario` §1.7.
- [x] Los IDs continúan desde `G27` y `C11`, sin huecos ni reutilización; `G34` queda retirada y su número no se libera.
- [x] No quedan anclas de línea: todas las referencias son archivo y sección.
- [x] Ninguna ruta de código se cita como fuente de alcance; se cita como forma vigente o como contraejemplo de un hecho ya declarado.
- [x] Ninguna salida contiene valores de `.env*` ni cadenas de conexión.
- [x] El folder `plans` de la raíz no se menciona: sigue retirado.
- [x] `C11`–`C15` quedan resueltas y registradas en §7.1; **no queda ninguna pregunta abierta**.
- [x] Los hallazgos `G27`–`G33` y `G35`–`G39` quedaron **aplicados** el 2026-10-25: `G27`, `G35` en
      `manual`; `G28`–`G31`, `G37`, `G38` en `plantilla`; `G38` además en `snippets`; `G36` en
      `glosario`; `G39` en `stack`; `G32` y `G33` en los comentarios del arnés y del marcador SQL.
- [x] `G34` queda **retirada** sin cambio en ningún documento ni artefacto.
- [x] El criterio de desempate (§1.2 y §4) queda declarado y acotado a los niveles 5 y 6.

## 9. Registro del ciclo de ejecución

- Reemplazado este archivo por completo (revisión 11) después de reevaluar la revisión 10 con el
  estado del workspace como opinión del usuario.
- Cambios respecto de la revisión 10: `G34` retirada; `G31` y `G36` reencuadradas de «implementación
  faltante» a «documento por delante del diseño»; `G39` añadida; `C11`–`C15` cerradas en §7.1;
  §5.1 respondida como «no falta implementación, falta cobertura documental».
- Se ejecutó la lectura de los niveles 1 a 5 y del árbol. **No** se ejecutó el gate ni se consultó el
  historial de commits: la evidencia de este ciclo es documental y se declara como tal.
- Doce hallazgos aplicados (`G27`–`G33`, `G35`–`G39`), todos con destino documental salvo dos
  cosméticos dentro de artefactos (`G32`, `G33`). `G34` retirada.
- Fuentes tocadas en la aplicación: `plantilla` (§2.1 con la fila de suites con base, §3 con
  `.scripts/`, §5, Fase 3, §12 con los generadores, el glosario y la auditoría), `manual` (encabezado,
  `Man-0.2` y `Man-2.6`), `snippets` §2 (mecanismo `MUDANZAPP_DB_TESTS`), `glosario` §Fuente única,
  `stack` §11, `e2e/support/harness.ts`, `e2e/playwright.config.ts` y `backend/sql/001_init.sql`.
- Gate del corte: `format:check`, `typecheck` y `lint` —el corte toca dos `.ts` y un `.sql`, no toca
  backend funcional ni arnés ejecutable—, más la evidencia de este registro.
- Sin commit registrado aquí: el cierre corresponde al commit del ciclo, conforme a
  [`.roo/rules/02-commits.md`](../.roo/rules/02-commits.md).
