# Bandeja de ideas

> **Rol:** entrada cruda de ideas que todavía no son alcance. El triage las convierte en fila del
> backlog, en hecho pendiente del dueño o en nada.
> **No es:** backlog, fuente de alcance ni promesa. Anotar aquí no autoriza construir
> ([`01-scope`](../.roo/rules/01-scope.md:1)).
> **Dueño:** Architect. **Revisión:** dueño del proyecto. **Fecha:** 2026-11-06.
> **Procedimiento:** [`workflow-ciclos`](workflow-ciclos.md:1) §3.

## 1. Reglas

- Se escribe **sin id, sin costo y sin formato**: una línea por idea, con fecha ISO.
- El triage ocurre fuera de un ciclo. No es un ciclo y no escribe código.
- Un hallazgo durante un ciclo entra aquí; el corte en curso no se amplía.
- Un ítem sale de la bandeja cuando tiene destino escrito, y **se borra** de la tabla.
- No se siembra con ideas inventadas: la primera fila la pone el dueño.

## 2. Bandeja

| #   | Fecha | Idea | Clase | Superficie probable | Triage |
| --- | ----- | ---- | ----- | ------------------- | ------ |
| —   | —     | —    | —     | —                   | —      |

## 3. Clases

| Clase            | Qué es                                               | Destino natural                                |
| ---------------- | ---------------------------------------------------- | ---------------------------------------------- |
| `producto`       | Una capacidad nueva del negocio                      | Fila del backlog con costo S/M/L               |
| `corte`          | Una parte de un ciclo ya declarado                   | Fila del backlog o §3.1 de `resumen-funcional` |
| `deuda`          | Corrección técnica sin cambio de alcance             | Fila del backlog, bloque C, D o T              |
| `doc`            | Un documento que contradice el código o una decisión | Su propio corte `docs`, o §10 del plan vigente |
| `hecho de dueño` | Una decisión que solo el dueño puede tomar           | `resumen-funcional` §6                         |

## 4. Triage

| Resultado        | Se escribe en                                       | Se borra de aquí |
| ---------------- | --------------------------------------------------- | ---------------- |
| Candidata        | fila del backlog con id, costo, fuente y disparador | sí               |
| Ya existe        | la fila existente gana la evidencia nueva           | sí               |
| Fuera de alcance | fila X con el disparador que la revisaría           | sí               |
| Hecho de dueño   | `resumen-funcional` §6 con dueño y disparador       | sí               |
| Ruido            | nada                                                | sí               |

## 5. Cómo se añade

Una fila al final de §2 con la fecha de hoy en ISO, la idea en una frase y la clase si se sabe. El
orden de la tabla no es prioridad.
