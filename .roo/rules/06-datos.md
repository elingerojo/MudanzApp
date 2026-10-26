# Datos y migraciones

Convención completa en `.plans/modelo-datos-app-mudanzapp.md` §9 y en `.guidelines/04`.

- SQL crudo y parametrizado con `pg`. Sin ORM ni query builder.
- **Migraciones** solo hacia adelante e idempotentes: `IF NOT EXISTS` cuando el DDL lo permite; si no,
  una forma idempotente equivalente, sin `DROP` y sin tabla de seguimiento de migraciones (nota de
  excepción E5 en `.guidelines/04` §3). La rama principal conserva esta regla.
- La **ruta automática no destruye**: el runner ejecuta todos los `backend/sql/*.sql` en cada
  invocación, así que un `DROP` ahí destruiría datos por corrida y no por despliegue.
- **Contracción:** quitar tablas o columnas vive en `backend/sql/contract/`, que el runner no enumera.
  Es versionado, revisado e idempotente (`IF EXISTS`), y se aplica a mano después de la corrida
  aditiva del mismo destino. Un archivo aplicado no se edita.
- **Destinos protegidos:** solo `mudanzapp` local y remota. Las bases `_test` y `_branch` son sandboxes
  desechables que se destruyen y reconstruyen enteros con el runner (nota E6 en `.guidelines/04` §3).
- La **matriz de entornos** es: local con cuatro objetivos (`main`, `test`, `branch`, `branch-test`);
  remoto con dos (`main`, `branch`). Las bases `_test` son **local-only**; los objetivos de prueba
  remotos se rechazan con error estable.
- El runner se aplica **a mano** y nunca en el arranque:
  - local: `db:migrate` (`main`), `db:migrate:test` (`test`), `db:migrate:branch` (`branch`) y
    `db:migrate:branch:test` (`branch-test`);
  - remoto: `db:migrate:remote` (`main`) y `db:migrate:remote:branch` (`branch`).
- La verificación de conectividad usa el mismo vocabulario: local con `db:ping`, `db:ping:test`,
  `db:ping:branch` y `db:ping:branch:test`; remoto con `db:ping:remote` y
  `db:ping:remote:branch`. Los comandos derivan, nunca imprimen y emiten solo `ok` o un error
  estable.
- La dev branch es **única y estable**, local y remota; la experimentación vive ahí. La rama
  principal no es un sandbox.
- La URL de la base de **pruebas se DERIVA** de la de desarrollo: mismo rol, host, puerto y
  parámetros, con el sufijo `_test` en el nombre de la base. **No se transporta** por el prompt ni
  se copia a mano. La derivación es la **única** forma de obtenerla. Una variable vacía cuenta como
  ausente.
- La URL de la **dev branch** se deriva con `_branch` (`mudanzapp` → `mudanzapp_branch`); la de su
  prueba, **añadiendo `_test`** al nombre de la dev branch (`mudanzapp_branch` →
  `mudanzapp_branch_test`). Toda base de prueba termina en `_test`; si el nombre ya termina en
  `_test`, no se vuelve a sufijar. Tampoco se transportan.
- El **único tipo de camino autorizado** es un script del repo que carga el archivo de entorno
  local que corresponda con el soporte nativo de Node, deriva el valor y **nunca lo imprime**. El
  catálogo completo de scripts y archivos vive en `.roo/rules/07-secretos.md`; esta regla no lo
  duplica.
- `.plans/modelo-datos-app-mudanzapp.md` es la **fuente única de verdad** del modelo; el DDL debe
  coincidir con él.
