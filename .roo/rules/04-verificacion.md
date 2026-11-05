# Verificación (gate)

Detalle en `.guidelines/06`. Los comandos canónicos son el contrato de scripts de la raíz
(`package.json` y `README.md` cuando existan). La plantilla y el manual son documentos locales no
versionados: describen los pasos, pero no son la fuente del gate.

Comandos por tipo de corte (solo los que apliquen):
- Siempre: `npm run typecheck`, `npm run lint`, `npm run format:check`.
- Backend: `npm run test:api`.
- Backend **con base de datos**: `npm run test:api:db`. Deriva la URL de pruebas y **nunca la
  imprime** (`06-datos.md` y `07-secretos.md`). Es una corrida local-only.
- Backend **con dev branch**: `npm run test:api:db:branch`. Deriva `_branch_test` con `_branch` y
  el sufijo `_test`; es el gate cuando el corte toca la dev branch. Es una corrida local-only.
- Frontend: `npm run test:web:<FE>`.
- Arnés e2e tocado: `npm run typecheck:e2e` (`e2e/tsconfig.json`).
- Frontend **o `shared/` tocado**: `npm run build:web:<FE>` por cada frontend afectado; compila
  `shared` antes, así que es la única forma de verificar el contrato compilado.
- Backend tocado en su build: `npm run build`, que emite `backend/dist/index.js`.
- Conexión a base: `npm run db:ping` (`main`), `npm run db:ping:test`, `npm run db:ping:branch` y
  `npm run db:ping:branch:test`; en remoto `npm run db:ping:remote` (`main`) y
  `npm run db:ping:remote:branch` (`branch`). Emiten solo `ok` o un error estable y nunca imprimen
  la URL.
- Toca esquema: `npm run db:migrate` (principal), `npm run db:migrate:test` (`mudanzapp_test`),
  `npm run db:migrate:branch` (`mudanzapp_branch`), `npm run db:migrate:branch:test`
  (`mudanzapp_branch_test`), `npm run db:migrate:remote` (`main` remoto con `.env.migration.local`) y
  `npm run db:migrate:remote:branch` (`branch` remoto). Se aplican a mano; nunca en el arranque. La
  derivación es la única forma de obtener la URL.
- Ruta crítica: `npm run test:e2e`; en dev branch, `npm run test:e2e:branch`.
- El arnés e2e **no** aplica migraciones: exige `db:migrate:test` para `test:e2e` y
  `db:migrate:branch:test` para `test:e2e:branch`, ejecutados a mano antes de correr; si el esquema
  falta, falla ruidosamente.
- Cierre del ciclo: la evidencia del corte, no el gate completo si el corte no lo exige.
- `Man-2.6` del manual reúne estas filas y las del arranque como **checklist completo**: su tabla no
  amplía este gate ni lo sustituye. Si discrepan, manda esta regla.

Reglas de corrida:
- Un comando por invocación.
- Una sola corrida de verificación a la vez.
- Nunca encadenar `npm test`.
- La verificación es **proporcional al corte**: un spike no corre el gate completo; un corte
  vertical sí.
- Sin evidencia ejecutable, el ciclo no se cierra.

Cierre de una funcionalidad (delta del wiki):
- Si el corte cambia un hecho del registro presente (`wiki`), el delta del tile dueño va en el
  **mismo commit** de la funcionalidad: solo el claim afectado y su cabecera de frescura.
- Sin delta, el cuerpo del commit declara `wiki: sin delta — <motivo>`. La ausencia explícita es
  válida; la silenciosa no.
- El tile dueño se identifica con la tabla área → tile de
  [`post-backfill-plan-wiki`](../../plans/post-backfill-plan-wiki.md:1) §4; no se abre el registro
  entero para decidirlo.
- Un claim obsoleto se corrige o se borra; su historia no se anota. Lo no construido va a A5 con su
  disparador.

Modo fake:
- Integración y e2e corren con `APP_MODE=fake`, `OAUTH_MODE=fake`, `R2_MODE=fake` y `AI_MODE=fake`.
- `live` significa credenciales válidas; `fake` es el doble determinista de pruebas mientras se
  consiguen las credenciales.
- Ninguna prueba depende de APIs reales, del proveedor de identidad, de R2 ni del motor de IA.
- Los dobles fake son deterministas y sustituibles sin tocar la variable de entorno.
