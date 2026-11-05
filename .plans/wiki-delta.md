# Wiki — delta por funcionalidad

> **Rol:** contrato del registro presente. Normativo: lo que el gate exige cuando un corte toca el wiki.
> **Dueño:** Architect. **Revisión:** dueño del proyecto. **Fecha:** 2026-11-05.
> **Se lee:** una vez por ciclo, solo la fila de §3 que corresponda.
> **No es** historia de ciclos ni lista de brechas: las brechas viven en `/app/a5-brechas`.

## 1. El hecho

El ciclo de una funcionalidad no termina en el commit del código: termina en ese commit con el delta
del tile dueño, o con la línea `wiki: sin delta` y su motivo. No hay un ciclo de wiki aparte.

## 2. Las cuatro reglas

1. **Un hecho, un tile dueño.** Los demás enlazan; no lo reescriben.
2. **El delta viaja en el mismo commit.** Nunca en un commit `docs` posterior.
3. **Sin delta se declara.** `wiki: sin delta — <motivo>` en el cuerpo. La ausencia explícita es
   válida; la silenciosa no.
4. **Corregir o borrar manda sobre añadir.** Lo retirado se borra; lo no construido va a A5 con su
   disparador, sin página propia.

## 3. Ruteo: área del código → tile

| Área tocada                                                                                          | Tile |
| ---------------------------------------------------------------------------------------------------- | ---- |
| `tiles.ts`, `app.routes.ts` del wiki, `wiki/README.md`, cabecera de tile                             | M0   |
| Raíz `package.json`, `00-stack`, `.env.example`, dependencia nueva, `PORT`, workspaces, lint/format  | E1   |
| `resumen-funcional`, alcance, fuera de alcance, capacidad sin ciclo                                  | E2   |
| `04-verificacion`, `README.md` §6/§12, `e2e/`, `backend/scripts/`, despliegue, Workers Builds        | E3   |
| Rutas y guardas de `frontend`/`shop`, puertos, `wrangler.jsonc`, roles de `shared/src/identity.ts`   | A0   |
| `backend/src/{admin,events,items}` en su parte de administración, `frontend/src/app/dashboard`       | A1   |
| `shared/src/{item,capture,ai}.ts`, `backend/src/{items,captures,ai,storage}`, invitación, sesión     | A2   |
| `shared/src/{event,listing,listing-page,cart,card}.ts`, `shop/src/worker.ts`, catálogo, ficha, cuenta | A3   |
| `backend/sql/*`, `backend/src/{config,errors,error-handler}.ts`, `backend/src/{identity,storage,ai}` | A4   |
| Vacío, aparcado, retirado, disparador, deuda conocida                                                | A5   |

Primera coincidencia gana. Si dos aplican, la dueña es la del backend y los demás tiles enlazan.

## 4. Cabecera de frescura

Cuatro líneas por tile; el ciclo que lo toca reescribe **solo** la segunda:

- **Estado:** `current` o `stale`.
- **Última verificación:** `<sha corto> · <AAAA-MM-DD>` del commit que aportó la evidencia. Un delta no
  se cita a sí mismo: el sha es el del feature o el de la última verificación externa.
- **Áreas:** rutas de código que el tile describe.
- **Decisiones:** referencias a `decisiones` §N, no su texto.

`stale` es un estado honesto: si un claim no se pudo verificar, el tile se marca `stale` y A5 registra
la brecha con su disparador. Nunca se rellena por inferencia.

## 5. Commits

- Delta con código: el tipo y alcance del feature; el cuerpo añade `wiki: <tile> — <qué cambió>`.
- Delta sin código (corrección del registro): `docs(wiki): …`.
- Sin delta: cuerpo con `wiki: sin delta — <motivo>`.

## 6. Gate

- Tocó el wiki: `npm run test:web:wiki` y `npm run build:web:wiki`.
- Siempre, como en cualquier corte: `npm run typecheck`, `npm run lint`, `npm run format:check`.
- Sincronizar el wiki no agrega `test:e2e`: el arnés no cambia.

## 7. Aceptación de un delta

- El claim afectado se corrigió o se borró; ningún hecho vive en dos tiles.
- La cabecera apunta al commit del feature o a la última verificación externa.
- `test:web:wiki` y `build:web:wiki` en verde.

## 8. Automatización y su límite

La obligación vive en [`04-verificacion`](../.roo/rules/04-verificacion.md:1), el único contexto
siempre cargado. Decidir si el hecho cambió no se automatiza: el gate hace visible la omisión, y
`git log --grep='wiki: sin delta'` lista todos los silencios declarados. Un `paths` por tile en
[`tiles.ts`](../wiki/src/app/tiles.ts:16) con un script que resuelva `git diff --name-only` es la
mejora siguiente si §3 se ignora; no entra sin aprobación.

## 9. Fuera de alcance

Sin dependencias nuevas, sin backend, sin e2e por sincronizar y sin una página por feature. El mapa es
de diez tiles fijos ([`tiles.ts`](../wiki/src/app/tiles.ts:1)); un tile nuevo cambia la topología del
sistema y lo decide el dueño.
