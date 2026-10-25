# Secretos y archivos de entorno

Nace de dos fugas reales al transcript. El objetivo no es "leer sin permiso": es **no necesitar
nunca el valor**.

- **Prohibido imprimir valores** de `backend/.env`, `backend/.env.local` o cualquier `.env*`:
  ni `read_file`, ni `type`, ni `git grep`, ni un `echo`, ni un script de diagnóstico.
- **Excepción: `backend/.env.example` es público.** Es la referencia versionada y solo lleva
  nombres, así que leerlo y escribirlo es normal: sin ceremonia y sin aprobación previa. La
  condición se verifica, no se supone: `git check-ignore -v backend/.env.example` no debe devolver
  nada y `git ls-files backend/.env.example` debe listarlo (`.gitignore` lo des-ignora con
  `!.env.example`). Si el archivo deja de estar versionado, o si aparece un valor real en él, la
  excepción **no** aplica: se detiene y se trata como cualquier `.env*`. Cualquier otro
  `*.env.example` futuro queda cubierto por la misma excepción, con las mismas dos comprobaciones.
- **El `.env.example` es contrato de nombres, no de valores.** Su trabajo es decir qué variables
  existen, cuáles se leen hoy y cuáles están reservadas; si una línea necesita un valor real para
  entenderse, el problema es la documentación y no el archivo.
- **Prohibido `search_files` con comodín** (`*`) desde la raíz: indexa archivos ignorados por git
  y vuelca valores. Buscar con patrón acotado y en un subdirectorio.
- El único tipo de camino autorizado para **usar** esos valores es un script del repo que los cargue
  con el soporte nativo de Node y los consuma **dentro del proceso**. El catálogo completo es:
  `dev:api`, `db:migrate`, `db:migrate:remote`, `db:migrate:test`, `db:migrate:branch`,
  `db:migrate:branch:test`, `db:migrate:remote:branch`, `db:ping`, `db:ping:test`,
  `db:ping:branch`, `db:ping:branch:test`, `db:ping:remote`, `db:ping:remote:branch`,
  `invite` (cuando exista), `test:api:db`, `test:api:db:branch`, `test:e2e` y `test:e2e:branch`.
  El valor nunca pasa por el prompt ni por la salida. Los comandos remotos usan
  `backend/.env.migration.local`; los locales, `backend/.env.local`.
- La URL de la **dev branch** y la de su prueba también se **derivan** (`_branch`, `_branch_test`); no
  se transportan ni se imprimen. La derivación `_test` es **local-only**; en remoto solo se deriva
  `_branch`.
- Lo que sí se puede transportar es el **nombre** de la variable y el **comando** que la resuelve.
- `.roo/mcp.json` **no se versiona**: lleva credenciales. `.roo/mcp.example.json` **sí se
  versiona**, con nombres, URL y variables de entorno con placeholders no secretos.
- **Protocolo de fuga:** si un valor aparece en una salida, **detenerse**, reportar el archivo y la
  variable (nunca el valor) y **recomendar rotación**. Un transcript no se puede rotar.
- Los secretos de producción viven en la plataforma, no en el árbol de trabajo: un `backend/.env`
  con valores reales en la máquina local es un vector, no una comodidad.
