# Modelo de datos — MudanzApp

> **Estado:** stub. No hay tablas de negocio aprobadas. Este documento es la fuente única del
> modelo; el DDL debe coincidir con él.
> **Dueño:** Architect / Backend. **Disparador de revisión:** nueva tabla, migración o cambio de
> contrato.

## 1. Estado

Pendiente de definir con el primer ciclo. Mientras no exista una tabla aquí, el único DDL válido es
el marcador idempotente que **ya existe** en `backend/sql/001_init.sql` —`CREATE SCHEMA IF NOT
EXISTS app`, sin tablas de negocio—, construido por la pre-decisión §14.2 de
`decisiones-tecnicas-app-mudanzapp.md` y coincidente con §7 de este documento.

## 2. Motor

- Postgres (Neon).
- SQL crudo y parametrizado con `pg`.
- Sin ORM ni query builder.

## 3. Convenciones de nombres

- Identificadores en minúsculas y sin ambigüedad.
- Las tablas de negocio se añaden con su corte vertical, no por adelantado.
- El nombre interno `mudanzapp` es el prefijo técnico cuando aplique.

## 4. Bases y dev branch

| Base | Uso | Derivación | Entorno |
| --- | --- | --- | --- |
| `mudanzapp` | Desarrollo principal | `DATABASE_URL` | Local y remoto |
| `mudanzapp_test` | Pruebas de la principal | Sufijo `_test` | Local |
| `mudanzapp_branch` | Dev branch estable | Sufijo `_branch` | Local y remoto |
| `mudanzapp_branch_test` | Pruebas de la dev branch | Sufijo `_test` sobre la dev branch | Local |

- La dev branch es única y estable; no se crea una por experimento.
- Local tiene las cuatro bases. Remoto solo tiene `mudanzapp` y `mudanzapp_branch`; las bases `_test` son
  **local-only** y no hay tests en producción.
- La rama principal no es un sandbox.

## 5. Derivación de URLs

- La URL de pruebas se deriva de `DATABASE_URL`: mismo rol, host, puerto y parámetros, con el
  sufijo `_test` en el nombre de la base: `mudanzapp` → `mudanzapp_test`.
- La URL de la dev branch se deriva con `_branch`: `mudanzapp` → `mudanzapp_branch`.
- La prueba de la dev branch se deriva añadiendo `_test` al nombre: `mudanzapp_branch` →
  `mudanzapp_branch_test`. Toda base de prueba termina en `_test`; si el nombre ya termina en
  `_test`, no se vuelve a sufijar.
- No se transportan ni se imprimen valores.
- La derivación es la **única** forma de obtener la URL. Una variable vacía cuenta como ausente.
- La derivación `_test` es local-only; en remoto solo se deriva `_branch`.

## 6. Runner

- El runner se aplica **a mano** y nunca en el arranque:
  - local: `db:migrate` (`main`), `db:migrate:test` (`test`), `db:migrate:branch` (`branch`) y
    `db:migrate:branch:test` (`branch-test`);
  - remoto: `db:migrate:remote` (`main`) y `db:migrate:remote:branch` (`branch`).
- Las bases `_test` son local-only; los objetivos de prueba remotos se rechazan con error estable.
- La conectividad se verifica con `db:ping` (local) y `db:ping:remote` (remoto); emiten solo `ok` o
  un error estable y nunca imprimen la URL.
- El e2e **no** aplica el esquema: su `globalSetup` solo verifica que exista y falla ruidosamente
  si falta. Antes de `test:e2e` se ejecuta `db:migrate:test`; antes de `test:e2e:branch`,
  `db:migrate:branch:test`.

## 7. Reglas de migración

- Solo hacia adelante e idempotentes en la ruta automática (`backend/sql/*.sql`).
- Cada cambio usa `IF NOT EXISTS` cuando el DDL lo permite; si no, una forma idempotente
  equivalente (nota E5 en `.guidelines/04` §3).
- La ruta automática no destruye: ningún archivo de `backend/sql/*.sql` usa `DROP`, porque el runner
  los ejecuta todos en cada invocación y destruirían datos por corrida.
- La contracción vive en `backend/sql/contract/`, que el runner no enumera: versionada, revisada e
  idempotente (`IF EXISTS`), aplicada a mano después de la corrida aditiva (nota E6).
- No hay tabla de seguimiento de migraciones.
- Un archivo aplicado no se edita.
- Los destinos protegidos son `mudanzapp` local y remota; `_test` y `_branch` son sandboxes que se
  destruyen y se reconstruyen con el runner.
- La rama principal conserva estas reglas; la experimentación vive en la dev branch.

## 8. Contratos de datos

- El contrato mínimo del corte define tipos, validación, forma del payload y códigos de error.
- La validación en la frontera protege el ciclo de datos corruptos; no sustituye las reglas del
  dominio.
- Todo hecho del modelo tiene un dueño y un disparador de revisión.

## 9. Convenciones de migración (detalle)

1. Un archivo por cambio, con nombre `NNN_descripcion.sql`, tres dígitos crecientes.
2. Cada cambio usa `IF NOT EXISTS` cuando el DDL lo permite; si no, se implementa de forma
   idempotente equivalente.
3. Ningún archivo de `backend/sql/*.sql` usa `DROP`: la ruta automática no destruye.
4. La contracción va en `backend/sql/contract/NNN_descripcion.sql`, con su propia secuencia, exige
   `IF EXISTS` y nunca mezcla DDL aditivo con destructivo. Se aplica a mano, después de la corrida
   aditiva del mismo destino.
5. No se crea tabla de seguimiento de migraciones.
6. Un archivo aplicado no se edita; un cambio nuevo se añade con otro archivo.
7. El runner ejecuta cada archivo en orden dentro de su propia transacción.
8. El DDL debe coincidir con este documento; si discrepan, uno está mal y debe corregirse.

## 10. Dueños y disparadores de revisión

| Hecho | Dueño | Disparador de revisión |
| --- | --- | --- |
| Tablas y columnas | Architect / Backend | Nueva tabla o cambio de contrato |
| Índices y restricciones | Architect / Backend | Consulta lenta o regla de dominio nueva |
| Convención de migración | Architect | Cambio de runner o de base |
| Derivación de URLs | Architect | Cambio de host, rol o convención |
| Matriz local/remota y comandos de migración | Architect | Cambio de topología o de runner |
