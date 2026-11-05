# Índice de contexto — qué leer según la tarea

Este índice no define alcance ni contratos: dice **qué documento cargar** para cada tipo de tarea.
Cargar todo el memory-bank en cada ciclo multiplica el contexto sin agregar hechos.

## Regla base

- **Siempre activo:** `.roo/rules/*` (no se cargan a mano; gobiernan todo).
- **Al planificar o implementar una funcionalidad:** `.guidelines/00`–`07`, `stack` y, si el corte
  toca datos, `modelo-datos`.
- **La plantilla y el manual no se cargan en ciclos de feature.** Son de arranque único y de hechos
  remotos.

| Tarea | Leer | No leer |
| --- | --- | --- |
| Arrancar un workspace nuevo | plantilla, manual, `.scripts/workspace-params.md`, `00`–`07`, stack | modelo-datos (salvo el runner) |
| Planificar un ciclo 0 → 1 | `00`–`07`, resumen-funcional, stack | plantilla, manual |
| Corte con base de datos | `04`, `06`, modelo-datos §9, `06-datos`, `07-secretos` | auditoría, glosario |
| Corte de integración externa | stack §7, `03`, `05`, `00-stack` | manual |
| Corte de UI o frontend | stack §3, `02`, `03` | modelo-datos |
| Corte de identidad o sesión | `04`, `05`, `02`, modelo-datos, `07-secretos` | dossier, manual |
| Corte del eCommerce | `03`, `02`, stack §7, modelo-datos | manual, auditoría |
| Sección del dossier en `wiki` (corregir un tile) | post-backfill-plan-wiki §3–§6 y el `.html` del tile | pre-backfill, fact sheets, modelo-datos |
| Crear el plan de backfill del wiki | pre-backfill-plan-wiki, `00`, `02`, decisiones-tecnicas | modelo-datos |
| Mantener el wiki sincronizado con cada feature | post-backfill-plan-wiki (completo), `04-verificacion`, `02-commits` | el resto |
| Ciclo del indicador de carga | indicador-carga-componente | el resto |
| Cerrar el ciclo | `06`, `02-commits`, `04-verificacion` | plantilla |
| Duda sobre jerarquía o excepción | glosario-de-criterios | el resto |
| Decisión técnica ya tomada | decisiones-tecnicas (biblioteca de patrones) | — |
| Llevar un hecho a remoto | manual `Man-3`, la lista de disparadores de `07` §5 y el registro de `.scripts/workspace-env.md` §5 | plantilla |

## Documentos y su rol

| Documento | Rol | Versionado | Se carga |
| --- | --- | --- | --- |
| `.roo/rules/*` | restricciones no negociables | sí | siempre |
| `.guidelines/00`–`07` | criterios de planificación | sí | por tarea |
| `stack-tecnologico-app-mudanzapp.md` | el CÓMO | sí | por tarea |
| `modelo-datos-app-mudanzapp.md` | modelo de datos | sí | cortes con datos |
| `resumen-funcional-app-mudanzapp.md` | el QUÉ | sí | planificación |
| `decisiones-tecnicas-app-mudanzapp.md` | biblioteca de patrones | sí | consulta |
| `glosario-de-criterios.md` | jerarquía y excepción | sí | consulta |
| `indicador-carga-componente.md` | contrato y aprendizaje del indicador de carga | sí | solo ciclos del indicador |
| [`pre-backfill-plan-wiki.md`](../plans/pre-backfill-plan-wiki.md:1) | pre-plan del backfill del wiki: método commit-first, 20 aspectos, ruteo a M0/E1-E3/A0-A5 y respuestas del dueño | sí | al abrir el backfill o el post-backfill |
| [`post-backfill-plan-wiki.md`](../plans/post-backfill-plan-wiki.md:1) | contrato de sincronía: delta del tile en el commit del feature, ruteo área→tile y cabecera de frescura | sí | todo ciclo de feature, en su §4 |
| `auditoria-consistencia-workspace.md` | evidencia de la apertura | sí | rara vez |
| `plantilla-inicializacion-workspace.md` | cómo se arranca | no | solo arranque |
| `manual-setup-workspace-local-y-remoto.md` | consolas | no | arranque y hechos remotos |
| `snippets-bootstrap.md` | código de humo de referencia | no | solo arranque |
| `.scripts/workspace-params.md` | nombres del workspace ya derivados, pendientes y mapa de renombrado | sí | solo arranque |
| `.scripts/workspace-env.md` | versiones de la Fase 1 y hechos remotos observados (§5) | sí | arranque y hechos remotos |

## Presupuesto de contexto por ciclo

- **Núcleo:** rules + `00`–`07` + stack + modelo-datos cuando aplique.
- **Fuera:** plantilla, manual, snippets, auditoría y los planes de funcionalidades anteriores.
- Si un hecho falta en el núcleo, se registra el vacío y se pregunta; no se rellena leyendo todo.
