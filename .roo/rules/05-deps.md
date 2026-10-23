# Dependencias

- Una dependencia de runtime nueva requiere **aprobación explícita** del usuario.
- Se registra en `.plans/stack-tecnologico-app-mudanzapp.md` §12, que es el **registro de
  dependencias**, con fecha, motivo, alternativa descartada y evidencia/aprobación del ciclo.
- Aterriza en su **propio commit** con el alcance `deps` (ver `.roo/rules/02-commits.md`).
- Pregunta si la dependencia compra un ciclo de aprendizaje; si no, no entra (`.guidelines/06`).
- Ninguna dependencia se agrega en silencio dentro de un corte.

> **Nota de excepción — E3.** Durante el bootstrap, una dependencia puede aterrizar en el mismo
> commit que el scaffold cuando son inseparables. Desde el primer ciclo de producto, toda
> dependencia de runtime nueva va en su propio commit `deps` y queda registrada en el stack.
> Revisión: al cerrar el bootstrap.
