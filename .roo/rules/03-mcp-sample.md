# MCP genérico (muestra reutilizable)

> **No es la regla del workspace.** Este archivo es la muestra genérica que se copia a un workspace
> nuevo. La regla específica de este workspace es [`03-mcp.md`](03-mcp.md:1), que nombra los
> servidores reales. `sample-mcp-remote` es un marcador de posición, no un servidor existente.

Servidor: `sample-mcp-remote` (definido en `.roo/mcp.json`).

Cuándo usarlo:
- Solo cuando la tarea toque el API de correspondiente.

Regla de uso:
- En esos casos, consultar primero la tool de introducción y luego las
  tools de descubrimiento/ejecución correspondientes.
- Nunca inventar endpoints, payloads, esquemas ni parámetros.
- `.roo/mcp.json` **no se versiona**: lleva credenciales. Solo se versionan los nombres en
  `.roo/mcp.example.json`.
- Ninguna delegación transporta valores de credenciales: se pasa el **nombre** de la variable y
  el **comando** que la resuelve (`.roo/rules/07-secretos.md`).

Cuándo NO usarlo:
- Tareas ajenas al API de este MCP: frontend, base de datos, tests, tooling,
  documentación, convenciones. No consultar el MCP en esos casos a menos que explícitamente sea indicado.
