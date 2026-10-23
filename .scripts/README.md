# `.scripts` — utilidades del workspace

## `generate-workspace-params.mjs`

Deriva el contrato de nombres del workspace a partir del nombre público y escribe dos artefactos
en este mismo directorio:

| Archivo | Rol |
| --- | --- |
| [`workspace-params.md`](workspace-params.md) | contexto de la Fase 1: marcadores, pendientes, SQL, superficies de marca y mapa de renombrado |
| [`workspace-params.json`](workspace-params.json) | verdad de máquina con la misma información, en orden determinista |

### Invocación canónica

```bash
node .scripts/generate-workspace-params.mjs MudanzApp
```

Sin dependencias y sin red: se puede ejecutar antes de que exista `package.json` (Fase 1). No lee
`.env*`, no imprime valores y no inventa los hechos que solo existen en remoto: esos quedan como
`pending` con la sección del manual que los produce.

### Opciones

| Opción | Efecto |
| --- | --- |
| `--slug <slug>` | fija el nombre interno a mano en lugar de derivarlo del público |
| `--frontends <lista>` | lista separada por comas; default `frontend,wiki` |
| `--out-dir <dir>` | directorio de salida; default el de este script |
| `--force` | sobrescribe un contrato generado para otra app |
| `--dry-run` | valida y renderiza sin escribir |
| `--help`, `-h` | ayuda |

### Códigos de salida

| Código | Significado |
| --- | --- |
| `0` | archivos escritos, o `--dry-run` validado |
| `1` | invariante interna rota (defecto del generador) |
| `2` | uso o argumento inválido |
| `3` | guarda de sobrescritura: el contrato existente es de otra app |
| `4` | fallo de escritura |

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
