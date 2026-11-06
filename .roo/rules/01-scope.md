# Alcance (memory-bank y lineamientos 0 → 1)

Fuentes de alcance del proyecto:
- `.plans/resumen-funcional-app-mudanzapp.md` (QUÉ hace la app)
- `.plans/stack-tecnologico-app-mudanzapp.md` (CÓMO se construye)
- `.guidelines/00`–`07` (lineamientos 0 → 1 para planificar funcionalidades)

Jerarquía: si hay conflicto, `.guidelines/00`–`07` prevalecen sobre reglas, planes y documentos
de trabajo; se corrige el documento inferior, no el lineamiento. Una excepción solo se admite
con la nota explicativa del criterio de excepción razonable.

Reglas:
- Al iniciar cualquier tarea, leer `.plans/` y `.guidelines/` antes de proponer o escribir código.
- El orden del ciclo —idea, declaración, plan, corte, evidencia, wiki, commit— vive en
  `plans/workflow-ciclos.md`; una idea que aún no está en el backlog entra por `plans/inbox.md`.
  Este archivo fija la obligación; ese fija el orden, y si discrepan manda este.
- El alcance es una hipótesis hasta que la revisión del ciclo lo valide: implementa el corte más
  pequeño que permita aprender, no la cobertura completa.
- Prohibido implementar funcionalidad o garantía no listada en esas fuentes. Si falta un hecho, el
  ciclo no se abre: registra el vacío y pregunta. Si el alcance cambia, propón el cambio con su
  costo; no amplíes por iniciativa propia.
- Un ciclo a la vez: una hipótesis, un corte vertical, una revisión y una decisión. No hay
  experimentos paralelos.
- La experimentación de una funcionalidad vive en una sola dev branch de base de datos; la rama
  principal no es un sandbox.
- Ante ambigüedad, preguntar antes de asumir.
