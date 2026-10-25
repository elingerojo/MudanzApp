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

- Cada **migración** (`backend/sql/*.sql`, aplicada por el runner) usa `IF NOT EXISTS` cuando el DDL
  lo permite; si no, una forma idempotente equivalente. No hay `DROP` ni tabla de seguimiento dentro
  de una migración.
- **Alcance de la prohibición de `DROP`.** Se prohíbe en las migraciones porque la garantía es que el
  esquema se pueda reejecutar sin destruir datos. Fuera de ellas —helpers locales de consola, pasos
  manuales sobre una base local desechable— está permitido: sanear no es migrar. Un helper destructivo
  nunca se versiona como migración ni se aplica contra el remoto, donde sigue mandando §6.
- El runner se aplica a mano a las cuatro bases locales (principal, pruebas, dev branch y prueba de
  la dev branch) y, en remoto, solo a `main` y `branch`; nunca en el arranque. Las bases `_test` son
  local-only.
- Un archivo aplicado no se edita.
- La rama principal conserva esta regla; la experimentación vive en la dev branch.

> **Nota de excepción — E5.** Qué se aparta: la exigencia literal de `IF NOT EXISTS` en cada
> cambio. La práctica aprobada es `IF NOT EXISTS` cuando el DDL lo permite; si no, una forma
> idempotente equivalente. Ventaja: permite DDL que PostgreSQL no soporta con `IF NOT EXISTS` sin
> trucos destructivos. Condiciones: sin `DROP`, sin pérdida de datos, mismo efecto al reejecutar,
> sin tabla de seguimiento y revisión por migración. Revisión: cuando PostgreSQL añada soporte o
> cuando un DDL no pueda hacerse idempotente.

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
