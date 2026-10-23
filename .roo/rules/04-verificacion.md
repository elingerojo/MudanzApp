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

Reglas de corrida:
- Un comando por invocación.
- Una sola corrida de verificación a la vez.
- Nunca encadenar `npm test`.
- La verificación es **proporcional al corte**: un spike no corre el gate completo; un corte
  vertical sí.
- Sin evidencia ejecutable, el ciclo no se cierra.

Modo fake:
- Integración y e2e corren con `APP_MODE=fake`, `R2_MODE=fake` y `AI_MODE=fake`.
- `live` significa credenciales válidas; `fake` es el doble determinista de pruebas mientras se
  consiguen las credenciales.
- Ninguna prueba depende de APIs reales, de R2 ni del motor de IA.
- Los dobles fake son deterministas y sustituibles sin tocar la variable de entorno.
