# 04 — Datos y seguridad

En 0 → 1, la velocidad de aprendizaje no justifica exponer datos ni secretos.

## 1. Deriva, no transportes

- La URL de pruebas se deriva de la URL principal (mismo rol, host, puerto y sufijo `_test`).
- El único tipo de camino autorizado es un script que la consume en proceso y nunca la imprime; el
  catálogo de scripts vive en `.roo/rules/07-secretos.md`.
- En delegaciones se pasa el nombre de la variable y el comando que la resuelve, nunca el valor.

## 2. Mínimo privilegio

- El rol local de base de datos no es superusuario; reproduce la forma del rol remoto.
- Las credenciales de integración se limitan al recurso que necesitan.
- Las credenciales viven solo en el backend; el navegador no las recibe.
- Los secretos de producción viven en la plataforma, no en el árbol de trabajo.
- La configuración de MCP con credenciales no se versiona.

## 3. Migraciones solo hacia adelante e idempotentes

- Cada **migración** (`backend/sql/*.sql`, aplicada por el runner) es aditiva y portable: usa
  `IF NOT EXISTS` cuando el DDL lo permite; si no, una forma idempotente equivalente. No hay `DROP`
  ni tabla de seguimiento dentro de una migración, y un archivo aplicado no se edita.
- **Por qué la ruta automática no destruye.** El runner enumera todos los `.sql` del directorio y los
  ejecuta **en cada invocación**, sin registro de lo aplicado. Con esa mecánica, un `DROP` en un
  archivo destruiría datos por corrida y no por despliegue; la prohibición es lo que permite no tener
  tabla de seguimiento.
- **La contracción tiene su propio camino.** Quitar tablas o columnas vive en
  `backend/sql/contract/`, que el runner no lee porque solo enumera el primer nivel y solo archivos
  `.sql`. Es versionado, revisado e idempotente por `IF EXISTS`, y se aplica a mano después de la
  corrida aditiva del mismo destino. Un archivo nunca mezcla DDL aditivo con destructivo.
- **El sandbox es desechable.** Las bases `_test` y `_branch` se destruyen y se reconstruyen enteras
  porque no son fuente de nada: su esquema se regenera con el runner. Los destinos protegidos son dos
  y solo dos: `mudanzapp` en local y en remoto.
- El runner se aplica a mano a las cuatro bases locales (principal, pruebas, dev branch y prueba de
  la dev branch) y, en remoto, solo a `main` y `branch`; nunca en el arranque. Las bases `_test` son
  local-only.
- La rama principal conserva esta regla; la experimentación vive en la dev branch.

> **Nota de excepción — E5.** Qué se aparta: la exigencia literal de `IF NOT EXISTS` en cada
> cambio. La práctica aprobada es `IF NOT EXISTS` cuando el DDL lo permite; si no, una forma
> idempotente equivalente. Ventaja: permite DDL que PostgreSQL no soporta con `IF NOT EXISTS` sin
> trucos destructivos. Condiciones: sin `DROP` en la ruta automática, sin pérdida de datos, mismo
> efecto al reejecutar, sin tabla de seguimiento y revisión por migración. Revisión: cuando
> PostgreSQL añada soporte o cuando un DDL no pueda hacerse idempotente.

> **Nota de excepción — E6.** Qué se aparta: la prohibición de destruir esquema fuera del entorno
> local. La práctica aprobada es que `_test` y `_branch` son sandboxes completos, locales y remotos,
> reconstruibles desde las migraciones de `main`, y que la contracción de cualquier destino tiene un
> camino versionado propio. Ventaja: un ciclo abandonado no arrastra esquema ni restricciones al
> siguiente, y el acto destructivo deja de ocurrir fuera de todo registro. Condiciones: nunca contra
> `mudanzapp` local ni remota; nunca dentro de una migración; nunca en el arranque; el destino se
> elige por nombre en la consola del proveedor, sin transportar la URL; después de un reset, el
> esquema se reconstruye con el runner.

## 4. Paridad local/remota

- El entorno local reproduce la forma del remoto: mismo tipo de rol, mismas convenciones de nombre, mismas reglas de conexión.
- La base de pruebas se deriva de la de desarrollo; la dev branch existe en local y en remoto.
- Un comportamiento que solo funciona en local es un defecto, no una comodidad.

## 5. Cero fugas en logs

- No se registran credenciales, payloads sensibles ni cuerpos crudos de respuesta.
- Si un valor aparece en una salida: detente, reporta el archivo y la variable (nunca el valor) y recomienda rotación.
- Un transcript no se puede rotar.

## 6. La rama principal no es un sandbox

- La experimentación de una funcionalidad vive en una dev branch de base de datos, local y remota.
- La rama principal se mantiene protegida y solo recibe cambios validados.
- Si una decisión es cara de revertir, no se prueba sobre la rama principal.
