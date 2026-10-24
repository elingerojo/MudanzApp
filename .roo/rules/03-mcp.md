# MCP (regla específica del workspace)

Servidores definidos en `.roo/mcp.json`; sus nombres y placeholders públicos viven en
`.roo/mcp.example.json`. La muestra genérica reutilizable es [`03-mcp-sample.md`](03-mcp-sample.md:1);
este archivo es la regla que aplica a MudanzApp.

| Servidor | Cuándo usarlo |
| --- | --- |
| `cloudflare-docs` | Solo cuando la tarea pregunte por productos o API de Cloudflare (Workers, Pages, R2, D1, KV, etc.) |
| `napkin-ai` | Solo cuando la tarea pida generar una visualización o un diagrama con Napkin |
| `railway` | Solo cuando la tarea pida **explícitamente** consultar Railway: estado, logs, métricas, variables o documentación. **Solo lectura** |

Reglas de uso:
- Consultar primero la tool de introducción y luego las tools de descubrimiento/ejecución
  correspondientes.
- Nunca inventar endpoints, payloads, esquemas ni parámetros.
- Una cabecera de autorización puesta bajo una clave que el cliente no reconoce se descarta **sin
  error** y el endpoint responde `401`: se copia la forma vigente de la entrada, no una inventada.
- `.roo/mcp.json` **no se versiona**: lleva credenciales. `.roo/mcp.example.json` **sí se
  versiona**, con nombres, URL y variables de entorno con placeholders no secretos.
- Ninguna delegación transporta valores de credenciales: se pasa el **nombre** de la variable y
  el **comando** que la resuelve (`.roo/rules/07-secretos.md`).

Cuándo NO usarlos:
- Tareas ajenas al API de esos servidores: frontend, base de datos, tests, tooling,
  documentación o convenciones. No consultar el MCP en esos casos a menos que se indique
  explícitamente.

### Alcance de `railway`: solo lectura

- Se usa **solo** cuando la tarea pida explícitamente consultar Railway. Mencionar un despliegue,
  un builder o un log no lo autoriza por sí solo: primero se responde con el repo y con la
  documentación de Railway.
- **Permitido:** herramientas de documentación, proyectos, entornos, servicios, despliegues, logs,
  métricas y trazas, y listados de variables.
- **Prohibido mutar la plataforma desde el MCP:** crear, actualizar o borrar servicios, volúmenes,
  buckets, dominios o webhooks; fijar variables; reiniciar, redesplegar o aceptar un despliegue
  preparado. Todo cambio en Railway es un paso manual del dueño del proyecto (`Man-3.4`).
- Lo que devuelve el MCP es evidencia del estado **actual**, no una fuente normativa: el contrato de
  despliegue vive en `Man-3.4` y la referencia es la documentación de Railway.
- Un valor de credencial que aparezca en una salida se trata según
  [`07-secretos.md`](07-secretos.md:1): detenerse, reportar archivo y variable, y recomendar
  rotación.
