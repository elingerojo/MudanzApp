# Auditoría de consistencia — MudanzApp (revisión 8)

> **Estado: auditoría pendiente de ejecución.** Esta revisión fija el marco, la línea base y los espacios de IDs. Las secciones 5 a 8 se llenan cuando la auditoría se ejecute; que estén vacías no significa que no haya hallazgos.
> **Fecha de apertura:** 2026-10-21 (UTC).
> **Autoridad:** `.guidelines/00`–`07` sobre reglas, planes y documentos de trabajo.
> **Criterios:** [`.plans/glosario-de-criterios.md`](glosario-de-criterios.md); esta revisión no los redefine.
> **Convención de referencias:** archivo y sección, sin anclas de línea.
> **Sin red de recuperación:** el workspace no es un repositorio de git. Lo que se borra no se restaura desde historial.

## 1. Qué sustituye esta revisión

- Sustituye por completo a la revisión 7, cuyo archivo se eliminó en el mismo ciclo. Esa es la única mención que sobrevive: no se citan sus secciones, sus tablas ni sus IDs.
- Se descarta la evidencia de los 24 arreglos acumulados en las revisiones 5 a 7, incluida la matriz de decisiones y hallazgos y la pregunta cerrada sobre el snippet de `package.json`. Decisión del ciclo: no se reproduce.
- Se retiró el folder `plans` de la raíz y su puntero. La política de versionado que ese folder sostenía no aplica y no se reintroduce.
- Consecuencia declarada: la trazabilidad de aquellos arreglos ya no existe como documento. La única red que queda es este texto, que no los reproduce.

## 2. Línea base heredada

Hay dos notas de excepción ya aprobadas en sus fuentes autoritativas. Esta revisión no las renumera, no las reaudita y no las modifica.

| Etiqueta | Qué es | Fuente autoritativa | Se cita desde |
| --- | --- | --- | --- |
| E3 | Una dependencia puede aterrizar en el mismo commit que el scaffold durante el bootstrap; desde el primer ciclo de producto va en su propio commit | [`.roo/rules/05-deps.md`](../.roo/rules/05-deps.md) §Dependencias | esa misma regla |
| E5 | `IF NOT EXISTS` cuando el DDL lo permite; si no, forma idempotente equivalente | [`.guidelines/04-datos-y-seguridad.md`](../.guidelines/04-datos-y-seguridad.md) §3 | [`.roo/rules/06-datos.md`](../.roo/rules/06-datos.md) §Datos y migraciones, [`stack-tecnologico-app-mudanzapp.md`](stack-tecnologico-app-mudanzapp.md) §5, [`modelo-datos-app-mudanzapp.md`](modelo-datos-app-mudanzapp.md) §7, [`decisiones-tecnicas-app-mudanzapp.md`](decisiones-tecnicas-app-mudanzapp.md) §14.1 y [`plantilla-inicializacion-workspace.md`](plantilla-inicializacion-workspace.md) Fase 4 |

Las etiquetas `E3` y `E5` están congeladas en el texto que las aprueba. Renumerarlas costaría editar seis archivos, varios de ellos autoritativos, sin ganancia de criterio.

## 3. Espacios de IDs

| Prefijo | Uso | Siguiente libre | Reservados |
| --- | --- | --- | --- |
| E | Excepciones aprobadas con nota en su fuente | E6 | `E3` y `E5`, heredados; no se reutilizan |
| G | Hallazgos que el ciclo corrige | G12 | ninguno |
| C | Preguntas abiertas | C3 | ninguno |
| N | Retirado | no se usa | el espacio no se reabre; las decisiones nuevas se registran en su fuente autoritativa |

Un ID no se reutiliza ni se salta. Si la auditoría no produce hallazgos, el siguiente libre sigue siendo `G12`.

## 4. Evidencia disponible

- Solo hay documentos. No existen `package.json`, `README.md`, `shared/`, `backend/`, `frontend/`, `wiki/` ni `e2e/`.
- «Aplicado» significará coincidencia textual con la fuente vigente, nunca artefacto ejecutable.
- No hay historial de commits que consultar y tampoco un gate ejecutable que correr: la evidencia de este ciclo es documental y se declara como tal.

## 5. Alcance de la auditoría

Pendiente de ejecución sobre los niveles 1 a 5 del glosario: `.guidelines/00` a `07`, `.roo/rules/`, `.roo/rules-architect/`, [`stack-tecnologico-app-mudanzapp.md`](stack-tecnologico-app-mudanzapp.md), [`resumen-funcional-app-mudanzapp.md`](resumen-funcional-app-mudanzapp.md), [`decisiones-tecnicas-app-mudanzapp.md`](decisiones-tecnicas-app-mudanzapp.md), [`modelo-datos-app-mudanzapp.md`](modelo-datos-app-mudanzapp.md), [`plantilla-inicializacion-workspace.md`](plantilla-inicializacion-workspace.md), [`manual-setup-workspace-local-y-remoto.md`](manual-setup-workspace-local-y-remoto.md) y el propio glosario.

## 6. Hallazgos

> **Auditoría pendiente de ejecución.** Sin hallazgos registrados. El vacío es de ejecución, no de conformidad.

| ID | Hallazgo | Estado | Evidencia textual |
| --- | --- | --- | --- |
| — | — | — | — |

## 7. Preguntas abiertas

> **Auditoría pendiente de ejecución.**

Ninguna registrada todavía. Las preguntas se numeran desde `C3`.

## 8. Verificación de cierre

Pendiente. Se marcará al ejecutar la auditoría.

- [ ] Cada hallazgo declara archivo y sección, y su estado sale de la taxonomía del glosario §1.7.
- [ ] Los IDs usados continúan desde `E6`, `G12` y `C3`, sin huecos ni reutilización.
- [ ] Ningún texto del registro menciona el folder `plans` ni enlaza a él.
- [ ] No quedan anclas de línea sin fecha de verificación.
- [ ] Ninguna ruta de código se cita como fuente existente fuera de una instrucción de construcción o una pre-decisión declarada.
- [ ] Ninguna salida contiene valores de `.env*` ni cadenas de conexión.

## 9. Registro del ciclo de apertura

- Creado [`.plans/glosario-de-criterios.md`](glosario-de-criterios.md) con el §1 de la revisión anterior, adaptado: la fila 6 de la tabla de niveles apunta al glosario, la definición de pre-decisión pierde la cláusula válida solo para el ciclo anterior y los criterios de evidencia quedan separados del snapshot.
- Reemplazado este archivo por completo: sin matriz de decisiones, sin matriz de hallazgos y sin la pregunta cerrada.
- Retirado el folder `plans` de la raíz y su archivo de puntero por decisión del usuario.
- Sin commit de cierre: el workspace todavía no es un repositorio de git.
