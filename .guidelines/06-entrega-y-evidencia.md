# 06 — Entrega y evidencia

En 0 → 1, el ciclo de aprendizaje es la unidad de entrega. Serializar es aceptable si compra evidencia limpia.

## 1. Un solo ciclo a la vez

- Una hipótesis, un corte vertical, una revisión, una decisión.
- El siguiente ciclo no empieza hasta que el anterior se fija o se descarta.
- No hay experimentos paralelos, ni siquiera con aislamiento.
- Acepta el costo en tiempo calendario; es el precio de no contaminar la evidencia.

## 2. Una sola dev branch de prueba

- La dev branch de base de datos es única y estable; no se crea una por experimento.
- Su nombre se deriva por convención (por ejemplo, el sufijo `_branch`), y sus bases de datos también, incluida la de pruebas (por ejemplo, añadiendo `_test`: `_branch_test`).
- Los valores se derivan, no se transportan.

## 3. Gate mínimo desde el día uno

- Typecheck, lint, formato y una prueba proporcional al corte.
- El gate crece con el producto; no se construye completo antes del primer ciclo.
- Un gate que no se ejecuta no es un gate.

## 4. Verificación proporcional al corte

- La evidencia debe responder la hipótesis, no demostrar todo el sistema.
- Cada ciclo tiene su propia verificación; no se reutiliza la de un ciclo anterior.
- Sin evidencia ejecutable, el ciclo no se cierra.

## 5. Dependencias explícitas

- Una dependencia de runtime nueva requiere aprobación y su propio commit.
- Pregunta si compra un ciclo de aprendizaje; si no, no entra.
- No se agrega en silencio dentro de un corte.

## 6. El commit cierra el ciclo validado

- El commit registra la hipótesis, el corte y la evidencia.
- Lo no validado se queda en la dev branch; no se integra.
- Un ciclo sin commit de cierre no está terminado.
