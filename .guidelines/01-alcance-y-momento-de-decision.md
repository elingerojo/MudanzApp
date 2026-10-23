# 01 — Alcance y momento de decisión

Al planificar una funcionalidad en un producto 0 → 1:

## 1. Alcance como hipótesis

Planifica el ciclo más pequeño que permita implementar, revisar y decidir si la funcionalidad se fija.

- No cierres el alcance antes de la evidencia.
- Si el alcance cambia, haz explícito su costo.

## 2. Corte vertical real

La unidad de aprendizaje es un walking skeleton con un caso de uso real (tracer bullet) o un spike acotado sobre la incógnita más riesgosa.

- Optimiza por aprendizaje (mínimo aprendible), no por cobertura.
- Un corte que no se puede revisar no es un corte de aprendizaje.

## 3. Dos nombres: interno fijo y público configurable

Separa la identidad técnica de la marca:

| Nombre | Naturaleza | Dónde vive | Política |
| --- | --- | --- | --- |
| Interno del proyecto | Fijo, técnico, sin carga de marca | Código, paquetes, roles y bases de datos, Workers, claves, repositorio | Se elige una vez y no se renombra |
| Público | Configurable, de marca | Título, metadatos, manifest, copy de UI, correos, legales, marketing, dominio y handles | Se espera que cambie al lanzamiento o después de conocer la adopción |

- El nombre público vive en una sola fuente y se consume desde ahí; no se cablea en el código.
- Las URLs técnicas usan el nombre interno; la marca pública se resuelve en la capa de presentación o con un dominio propio.
- Acepta que el renombrado público tendrá un costo. No lo evites congelando la marca: minimízalo centralizando, automatizando el reemplazo y planificando redirecciones en las superficies externas.
- El nombre interno se elige por unicidad y estabilidad, no por marketing.

### Presupuesto de renombrado

1. Inventaria las superficies del nombre público: título, metadatos, manifest, copy, correos, legales, dominio y handles.
2. Mantén una sola fuente para el nombre público.
3. Automatiza el reemplazo; no edites a mano.
4. Planifica redirecciones y alias para dominio y handles.
5. Revisa el nombre al lanzamiento y después de conocer la adopción.

## 4. Decide solo lo caro de revertir

Cierra antes las decisiones de alto costo de reversión: esquema, contratos públicos e identificadores externos.

- Para ellas, planifica el trabajo en una dev branch de base de datos, local y remota.
- Difiere las decisiones reversibles hasta tener evidencia.

## 5. Revisa antes de fijar

Nada se considera fijo hasta revisar su funcionamiento.

- Cada ciclo cierra con una verificación ejecutable.
- Si la revisión contradice la hipótesis, vuelve al alcance; no defiendas la implementación.
