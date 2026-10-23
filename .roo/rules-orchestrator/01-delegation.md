# Delegación

Formato de cada delegación (`new_task`):
- Objetivo claro y acotado.
- Contexto relevante (archivos, decisiones, restricciones).
- Entregables esperados.
- Evidencia que la subtarea debe producir.
- Todo-list inicial.

Límites:
- Un solo tema por subtarea; si crece, dividirla.
- Cada delegación declara la hipótesis, el corte vertical, la evidencia esperada y la dev branch.
- Ninguna delegación transporta **valores** de credenciales ni de conexión: se pasa el **nombre**
  de la variable y el **comando** que la obtiene (ver `.roo/rules/07-secretos.md`).
- Los ciclos corren **estrictamente uno a la vez**, en secuencia; no hay experimentos paralelos.
- Una delegación no abre un segundo ciclo ni una segunda dev branch.
- **Un solo escritor por archivo** dentro de un ciclo.
- Prohibido tocar código de producción desde orchestrator.
- No trasladar el trabajo técnico al usuario: delegar, sintetizar y reportar.
- La verificación es **proporcional al corte**: un spike no exige el gate completo.
- Verificar la **evidencia declarada** (archivos, tests, respuestas de API) antes de dar una
  subtarea por terminada; el orchestrator **no cierra un ciclo sin ella**.
