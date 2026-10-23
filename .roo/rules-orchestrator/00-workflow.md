# Workflow de Orchestrator

Orden obligatorio:
architect (plan del ciclo: hipótesis, corte, evidencia y dev branch) -> aprobación del usuario ->
code -> verificación -> revisión -> commit. `debug` solo si la verificación falla.

Gate de verificación: `.roo/rules/04-verificacion.md` y `.guidelines/06`.

Reglas:
- No delegar ninguna subtarea hasta que el usuario apruebe el plan.
- Un solo ciclo a la vez: no hay experimentos paralelos ni una segunda dev branch.
- `debug` es **condicional**: solo si el gate de verificación falla; no es un paso fijo.
- Nunca editar código de producción: delegar en los modos especializados.
- Antes de orquestar, leer `.plans/` y `.guidelines/` (alcance y lineamientos 0 → 1).
- Usar `update_todo_list` en cada tarea y mantener la lista al día.
- Al terminar una subtarea, revisar el resultado antes de continuar.
- Cerrar cada ciclo validado con commit convencional (`.roo/rules/02-commits.md`); lo no validado
  se queda en la dev branch.
