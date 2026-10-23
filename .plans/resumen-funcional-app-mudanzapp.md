# Resumen funcional — MudanzApp

> **Estado:** stub de alcance. Pendiente de redacción por el Architect con el usuario.
> **Naturaleza:** fuente única del **QUÉ**. No se implementa ninguna funcionalidad que no esté
> listada aquí y validada por un ciclo 0 → 1.
> **Dueño:** Architect (alcance). **Disparador de revisión:** cierre de cada ciclo o cambio de
> hipótesis.

## 1. Propósito

Pendiente de definir. Este documento existe para que las reglas `01-scope` y `00-stack` apunten a
una fuente real y para que el primer ciclo no invente alcance.

## 2. Alcance del primer ciclo

Pendiente. El Architect debe registrar aquí:

- la hipótesis del ciclo;
- el corte vertical mínimo que permite aprenderla;
- la evidencia ejecutable que la revisa;
- lo que explícitamente queda fuera.

## 3. Fuera de alcance

Pendiente. Nada de lo no listado en este documento se considera aprobado, aunque exista en el
stack o en el código de referencia.

## 4. Capacidades core declaradas

| Capacidad | Estado | Nota |
| --- | --- | --- |
| — | Pendiente de declaración | Ninguna capacidad de negocio se hereda del workspace de origen. El Architect con el usuario las declara en el primer ciclo. |

- El arranque permanece cero-features: solo contiene el humo necesario para verificar el stack.
- Una capacidad core no se implementa hasta que su ciclo defina alcance y evidencia.
- `frontend` y `wiki` son la topología técnica de frontends fijada en el stack, no capacidades de negocio.

## 5. Hechos pendientes de dueño

| Hecho | Dueño | Disparador de revisión |
| --- | --- | --- |
| Propósito y usuarios | Architect con el usuario | Antes del primer ciclo |
| Alcance del primer ciclo | Architect | Al cerrar la hipótesis |
| Fuera de alcance | Architect | Al cambiar el alcance |
| Capacidades core | Architect con el usuario | Al declarar o cambiar una capacidad |
| Criterio de aceptación | Architect con el usuario | Antes de implementar |

## 6. Regla de uso

- El alcance es una hipótesis hasta que la revisión del ciclo lo valide.
- Si falta un hecho, el ciclo no se abre: se registra el vacío y se pregunta.
- Ningún documento de stack o plantilla amplía este alcance.
