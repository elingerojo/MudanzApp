# `.scripts` — utilidades del workspace

## `generate-workspace-params.mjs`

Deriva el contrato de nombres del workspace a partir del nombre público y escribe dos artefactos
en este mismo directorio:

| Archivo                                          | Rol                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [`workspace-params.md`](workspace-params.md)     | contexto de la Fase 1: marcadores, pendientes, SQL, superficies de marca y mapa de renombrado |
| [`workspace-params.json`](workspace-params.json) | verdad de máquina con la misma información, en orden determinista                             |

### Invocación canónica

```bash
node .scripts/generate-workspace-params.mjs MudanzApp
```

Sin dependencias y sin red: se puede ejecutar antes de que exista `package.json` (Fase 1). No lee
`.env*`, no imprime valores y no inventa los hechos que solo existen en remoto: esos quedan como
`pending` con la sección del manual que los produce.

### Cuándo se corre, y por qué queda congelado

Se corre en la Fase 1, **antes del primer bring-up**. Desde la primera fila observada en
[`workspace-env.md`](workspace-env.md) §5 los dos artefactos son un **snapshot congelado**: la
evidencia de cómo se inició la implementación, no una fuente viva de hechos de plataforma.
Regenerarlos después de ese punto es una desviación registrada con `--force`, no una rutina.

Motivo: una sola fuente por hecho. Los hechos remotos viven en `workspace-env.md` §5 y los nombres
derivados en el snapshot; si el snapshot se regenerara con hechos de plataforma, el mismo dato
tendría dos dueños y ambos derivarían. En el snapshot, `pending` significa «el generador no puede
derivarlo del nombre público», no «nadie lo conoce».

### Opciones

| Opción                | Efecto                                                          |
| --------------------- | --------------------------------------------------------------- |
| `--slug <slug>`       | fija el nombre interno a mano en lugar de derivarlo del público |
| `--frontends <lista>` | lista separada por comas; default `frontend,wiki`               |
| `--out-dir <dir>`     | directorio de salida; default el de este script                 |
| `--force`             | sobrescribe un contrato generado para otra app                  |
| `--dry-run`           | valida y renderiza sin escribir                                 |
| `--help`, `-h`        | ayuda                                                           |

### Códigos de salida

| Código | Significado                                                   |
| ------ | ------------------------------------------------------------- |
| `0`    | archivos escritos, o `--dry-run` validado                     |
| `1`    | invariante interna rota (defecto del generador)               |
| `2`    | uso o argumento inválido                                      |
| `3`    | guarda de sobrescritura: el contrato existente es de otra app |
| `4`    | fallo de escritura                                            |

### Reglas que el script hace cumplir

- El slug interno usa solo `[a-z0-9]`, empieza por letra y mide entre 2 y 32 caracteres.
- `DB_TEST` deriva con `_test`, `DB_DEV_BRANCH` con `_branch` y `DB_DEV_BRANCH_TEST` con `_test`
  sobre la dev branch; ninguna base de prueba se sufija dos veces.
- Un `WORKER_NAME` por frontend, sin repeticiones, y el primero toma el slug.
- La guarda compara `workspace-params.json.identity.internal.appSlug`: un contrato de otra app no
  se sobrescribe sin `--force`, porque renombrar el nombre interno tiene costo
  ([`.guidelines/01`](../.guidelines/01-alcance-y-momento-de-decision.md) §3).

### Lo que no hace

- No verifica colisión real (scope npm, Worker, repositorio): exige red y es un paso de la Fase 1.
- No crea credenciales ni cadenas de conexión; el archivo solo lleva nombres y placeholders.
- No renombra el workspace: describe el renombrado y lo deja al ciclo que lo ejecute.

### Cómo se usan los artefactos

En la Fase 1, leer [`workspace-params.md`](workspace-params.md) como contexto único: su tabla de §3
se pega en `plantilla-inicializacion-workspace.md` §0, su §7 trae el SQL del rol y de las cuatro
bases locales, y su §10 el mapa de tokens que se aplica sobre la copia hecha en la Fase 0. La fuente
de alcance sigue siendo la plantilla; el archivo es la instantánea que evita teclear marcadores
ambiguos.

## `generate-brand-index.mjs`

Escribe el nombre público en el elemento de título del artefacto construido de un frontend. La marca
vive en `shared/src/brand.json` (`.plans/decisiones-tecnicas-app-mudanzapp.md` §14.3) y el `index.html`
de cada frontend conserva ese elemento **vacío**: no cablea el nombre.

```bash
node .scripts/generate-brand-index.mjs --frontend frontend
```

- Lo invoca `npm run build -w <FE>` **después** de `ng build`; en `ng serve` no corre y el título lo
  fija la app al arrancar desde la misma fuente.
- Determinista e idempotente. No lee `.env*`, no usa red y no escribe fuera de `dist/`.
- Códigos estables: `brand-index-frontend-missing`, `brand-index-source-unreadable`,
  `brand-index-name-missing`, `brand-index-artifact-missing`, `brand-index-title-missing` y
  `brand-index-title-ambiguous`.

## `workspace-env.md`

Evidencia versionada de la Fase 1: versiones de `Man-2.1`, veredicto de compatibilidad con el stack
y colisiones que solo se confirman en remoto. No lo produce el generador y no contiene credenciales
ni valores de `.env*`.

Su §5 es el **registro de los hechos remotos ya observados** (owner y repositorio, `BACKEND_HOST`,
subdominio `workers.dev`, URL de cada Worker y `APP_BASE_URL`). Es la fuente **viva** de esos hechos
y la única: [`workspace-params.md`](workspace-params.md) los deja como `pending` porque registra
nombres derivados del nombre público, no puede conocer hechos de plataforma y, desde la primera fila
de §5, es un snapshot congelado. Al obtener un valor nuevo se anota en §5, nunca en el snapshot.
