# Glosario de criterios — MudanzApp

> **Autoridad:** `.guidelines/00`–`07` sobre reglas, planes y documentos de trabajo. Este glosario no crea ni deroga lineamientos: fija el vocabulario con el que se audita su cumplimiento.
> **Fuente única:** este archivo es la fuente única del **criterio de excepción razonable** (§1.3), de la **definición de pre-decisión** (§1.4) y de la **plantilla de nota de excepción** (§1.5) que exige `.roo/rules/01-scope.md` §Alcance. La regla de modo `.roo/rules-architect/00-planning-context.md` §Contexto de planificación repite el requisito dentro de la máquina, pero **no se versiona ni viaja** (no está en `.gitignore` como excepción y ningún inventario la copia): la fuente del requisito es `01-scope`.
> **Convención de referencias:** archivo y sección, sin anclas de línea.

## 1. Jerarquía y criterios

### 1.1 Niveles

| Nivel | Fuente | Papel |
| --- | --- | --- |
| 1 | `.guidelines/00`–`07` | Autoridad normativa |
| 2 | [`stack-tecnologico-app-mudanzapp.md`](stack-tecnologico-app-mudanzapp.md) y [`resumen-funcional-app-mudanzapp.md`](resumen-funcional-app-mudanzapp.md) | Fuente del CÓMO y del QUÉ |
| 3 | `.roo/rules/` y `.roo/rules-orchestrator/` | Reglas operativas |
| 4 | [`decisiones-tecnicas-app-mudanzapp.md`](decisiones-tecnicas-app-mudanzapp.md) y [`modelo-datos-app-mudanzapp.md`](modelo-datos-app-mudanzapp.md) | Registro de decisiones y modelo |
| 5 | [`plantilla-inicializacion-workspace.md`](plantilla-inicializacion-workspace.md) y [`manual-setup-workspace-local-y-remoto.md`](manual-setup-workspace-local-y-remoto.md) | Documentos locales de trabajo, no versionados |
| 6 | Este archivo (`.plans/glosario-de-criterios.md`) | Vocabulario de auditoría; no es fuente de alcance ni de decisiones |

Cada auditoría es un registro de trabajo del nivel 6: describe el estado de los niveles 1 a 5 y no puede citarse como si fuera una fuente de alcance.

### 1.2 Regla por defecto

Si un documento inferior contradice un lineamiento, se corrige el documento inferior. La jerarquía no se invierte ni se negocia documento a documento.

### 1.3 Excepción razonable

Una práctica inferior puede conservarse aunque se aparte de un lineamiento si cumple las cinco condiciones:

1. **No debilita una garantía de seguridad:** nada de secretos expuestos, datos sensibles en logs, destrucción de esquema en la ruta automática, fallos silenciosos ni pérdida de aislamiento.
2. **La ventaja es concreta y demostrable:** determinismo, menos duplicación, mejor aprendizaje, menos riesgo operativo o menos pasos manuales propensos a error.
3. **Es mínima y reversible:** afecta solo el caso que la justifica y puede retirarse sin rehacer el diseño.
4. **Queda documentada en la fuente autoritativa del hecho afectado:** la nota dice qué se aparta, por qué, qué ventaja produce y cuándo se revisa.
5. **La aprueba el dueño del hecho o el usuario.**

Si no hay ventaja evidente, no hay excepción: se corrige el documento inferior. Si hay duda, no se clasifica: se pregunta antes de definir la contradicción.

### 1.4 Pre-decisión

Una **pre-decisión** es un hecho ya decidido cuya implementación está pendiente. No es una fuente normativa y no puede citarse como si el artefacto existiera. Debe declarar estado, dueño, evidencia normativa, lugar de construcción y disparador de revisión. Cuando el artefacto existe, se reemplaza por un puntero al artefacto. Una pre-decisión que transporte payload debe declarar además el disparador que retira ese payload al crear el archivo.

### 1.5 Plantilla de nota de excepción

> **Nota de excepción — [ID].** Qué se aparta: [regla y texto]. Ventaja: [beneficio concreto]. Condiciones: [límites de la excepción]. Revisión: [disparador para retirarla o confirmarla].

### 1.6 Referencias

Las referencias de este glosario y de cada revisión de auditoría apuntan a archivo y sección, no a líneas. Una línea es evidencia de una revisión concreta, no un contrato estable. Cuando una línea sea imprescindible, se marca con la fecha de verificación y se revalida al aplicar el cambio.

### 1.7 Aprobado no es aplicado

Una decisión aprobada no cambia la fuente hasta que el texto de la fuente la contiene. El estado se clasifica solo por evidencia textual:

| Estado | Significado |
| --- | --- |
| Aplicada | El texto vigente coincide con la resolución en todas sus fuentes |
| Parcial | Parte de las fuentes coincide; queda al menos una contradicción |
| Pendiente | Ninguna fuente contiene la resolución |
| Abierta | No hay decisión; se registra sin cambiar documentos |
| Superada | Otra decisión la reemplazó |
| Retirada | El objeto de la decisión no existe y no debe existir |

Una pre-decisión no cuenta como aplicada. Una nota de excepción sin texto en la fuente autoritativa tampoco.

### 1.8 Criterios de evidencia

- Toda ruta de código citada como **fuente** es un hallazgo, salvo que sea una **instrucción de construcción** o una **pre-decisión** declarada.
- Una referencia a una ruta que no existe debe declarar su base: procedencia del repo de origen o instrucción de construcción.
- Un artefacto ausente no es evidencia de aplicación; el estado se clasifica con el texto de la fuente vigente (§1.7).
