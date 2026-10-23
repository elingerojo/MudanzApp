# MCP (regla específica del workspace)

Servidores definidos en `.roo/mcp.json`; sus nombres y placeholders públicos viven en
`.roo/mcp.example.json`. La muestra genérica reutilizable es [`03-mcp-sample.md`](03-mcp-sample.md:1);
este archivo es la regla que aplica a MudanzApp.

| Servidor | Cuándo usarlo |
| --- | --- |
| `cloudflare-docs` | Solo cuando la tarea pregunte por productos o API de Cloudflare (Workers, Pages, R2, D1, KV, etc.) |
| `napkin-ai` | Solo cuando la tarea pida generar una visualización o un diagrama con Napkin |

Reglas de uso:
- Consultar primero la tool de introducción y luego las tools de descubrimiento/ejecución
  correspondientes.
- Nunca inventar endpoints, payloads, esquemas ni parámetros.
- `.roo/mcp.json` **no se versiona**: lleva credenciales. `.roo/mcp.example.json` **sí se
  versiona**, con nombres, URL y variables de entorno con placeholders no secretos.
- Ninguna delegación transporta valores de credenciales: se pasa el **nombre** de la variable y
  el **comando** que la resuelve (`.roo/rules/07-secretos.md`).

Cuándo NO usarlos:
- Tareas ajenas al API de esos servidores: frontend, base de datos, tests, tooling,
  documentación o convenciones. No consultar el MCP en esos casos a menos que se indique
  explícitamente.
