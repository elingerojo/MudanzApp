# Plan — Sincronía del wiki por ciclo de feature (fase 3)

> **Naturaleza:** plan de post-backfill. **Dueño:** Architect. **Revisión:** dueño del proyecto.
> **Entrada:** [`pre-backfill`](pre-backfill-plan-wiki.md:10) §8 (contrato de las tres fases) y §14
> (superación documental); [`backfill`](backfill-plan-wiki.md:1) §12 (los diez tiles ya escritos).
> **Objetivo único:** que el wiki no se desincronice **sin obligar a nadie a acordarse**.
> **Presupuesto:** este documento se lee completo en un ciclo de feature. Si crece, falla.

## 1. El único hecho nuevo

El ciclo de un feature **no termina en el commit del código**: termina en ese mismo commit con el
delta del tile dueño, o con la línea `wiki: sin delta` y su motivo. No hay un ciclo de wiki aparte.

## 2. Las cuatro reglas (todo el contrato)

1. **Un hecho, un tile dueño.** Los demás enlazan; no reescriben.
2. **El delta viaja en el mismo commit del feature.** Nunca en un commit `docs` posterior.
3. **Sin delta se declara.** Si el hecho no cambia el registro, el cuerpo del commit lleva
   `wiki: sin delta — <motivo>`. La ausencia explícita es válida; la silenciosa no.
4. **Corregir o borrar manda sobre añadir.** Lo retirado se borra del mapa; no se documenta su
   historia. Lo no construido va a A5 con su disparador, sin página propia.

## 3. Procedimiento: tres pasos, dos archivos

| Momento            | Acción                                                     | Contexto máximo                           |
| ------------------ | ---------------------------------------------------------- | ----------------------------------------- |
| Antes de codificar | Abrir §4 y anotar el tile dueño                            | esta línea de la tabla                    |
| Antes del commit   | Editar **solo** el claim afectado y subir la cabecera (§6) | el `.html` del tile + el archivo cambiado |
| Cierre             | Gate de §5 y commit de §7                                  | —                                         |

Nada más se lee para sincronizar: no se abre el wiki entero, ni el pre-plan, ni los fact sheets.

## 4. Ruteo: área del código → tile dueño

Esta tabla **sustituye** la lectura del registro. Primera coincidencia gana; si dos aplican, la dueña
es la de la ruta del backend y los demás tiles enlazan.

| Área tocada                                                                                                         | Tile   |
| ------------------------------------------------------------------------------------------------------------------- | ------ |
| `tiles.ts`, `app.routes.ts` del wiki, `wiki/README.md`, cabecera de tile                                            | **M0** |
| Raíz `package.json`, `.roo/rules/00-stack`, `.env.example`, dependencia nueva, `PORT`, workspaces, lint/format      | **E1** |
| `resumen-funcional`, alcance, fuera de alcance, capacidad sin ciclo                                                 | **E2** |
| `04-verificacion`, `README.md` §6/§12, `e2e/`, `backend/scripts/`, despliegue, Workers Builds                       | **E3** |
| Rutas y guardas de `frontend`/`shop`, puertos, `wrangler.jsonc`, roles de `shared/src/identity.ts`                  | **A0** |
| `backend/src/{admin,events,items}` en su parte de administración, `frontend/src/app/dashboard`                      | **A1** |
| `shared/src/{item,capture,ai}.ts`, `backend/src/{items,captures,ai,storage}`, invitación, sesión de evento          | **A2** |
| `shared/src/{event,listing,listing-page,cart,card}.ts`, `shop/src/worker.ts`, catálogo, ficha, cuenta de tienda     | **A3** |
| `backend/sql/*`, `backend/src/{config,errors,error-handler}.ts`, `backend/src/{identity,storage,ai}`, error estable | **A4** |
| Vacío, aparcado, retirado, disparador, deuda conocida                                                               | **A5** |

## 5. Gate del delta

Proporcional, sin inventar comandos:

- Tocó el wiki: `npm run test:web:wiki` y luego `npm run build:web:wiki`.
- Siempre, como en cualquier corte: `npm run typecheck`, `npm run lint`, `npm run format:check`.
- No se agrega `test:e2e` por sincronizar el wiki: el arnés no cambia.

## 6. Cabecera de frescura

Cada tile publica y mantiene estas cuatro líneas; el ciclo que toca el tile **solo** reescribe la
segunda:

- **Estado:** `current` o `stale`.
- **Última verificación:** `<sha corto> · <AAAA-MM-DD>` del commit que aportó la evidencia. Un delta
  no se cita a sí mismo: el sha es el del feature o el de la última verificación externa.
- **Áreas:** rutas de código que el tile describe.
- **Decisiones:** enlaces a `decisiones` §N, no su texto.

`stale` es un estado honesto: si un claim no se pudo verificar, el tile se marca `stale` y A5 registra
la brecha con su disparador. Nunca se rellena por inferencia.

## 7. Commits

- Delta con código: el tipo y alcance del feature; el cuerpo añade `wiki: <tile> — <qué cambió>`.
- Delta sin código (corrección del registro): `docs(wiki): …`.
- Sin delta: cuerpo con `wiki: sin delta — <motivo>`.

## 8. Qué lo hace automático (y qué no)

Lo que **no** depende de la memoria es una sola cosa: la sección _Cierre de una funcionalidad (delta
del wiki)_ de [`04-verificacion`](../.roo/rules/04-verificacion.md:1), porque `.roo/rules/*` es el
único contexto siempre cargado ([`indice-contexto`](../.plans/indice-contexto.md:8)). Ahí vive la
obligación y el puntero a §4; el procedimiento no vive ahí, porque se paga en cada ciclo aunque no se
use.

Lo que **sigue** dependiendo de alguien es decidir si el hecho cambió. El gate hace visible la
omisión; no puede sustituir la decisión. La auditoría tampoco necesita herramienta: el cuerpo del
commit es permanente, así que `git log --grep='wiki: sin delta'` lista todos los silencios
declarados.

Automatización opcional, solo si el piloto de §9 muestra que la tabla §4 se ignora: un `paths` por
tile en
[`tiles.ts`](../wiki/src/app/tiles.ts:16) y un script sin dependencias que, dado
`git diff --name-only`, imprima los tiles afectados. Costo: campo nuevo, un script, un caso en
[`tiles.spec.ts`](../wiki/src/app/tiles.spec.ts:1) y una fila en `README` §6. No entra sin aprobación.

## 9. Prueba de aceptación

El **primer ciclo de feature posterior al backfill** es el piloto. Evidencia exigida:

1. El commit del feature contiene el delta del tile dueño, o la línea `wiki: sin delta`.
2. La fecha de la cabecera es la del commit del feature, y su sha es el de ese commit o el de la
   última verificación externa que lo respalda.
3. Ningún hecho quedó en dos tiles con dos redacciones.
4. `test:web:wiki` y `build:web:wiki` en verde.

Si el piloto falla, se corrige este plan §3–§4, no el comportamiento observado.

## 10. Fuera de alcance

Nada de dependencias nuevas, backend, e2e, una página por feature ni un tile nuevo por funcionalidad:
el mapa sigue siendo diez tiles fijos. Un tile se agrega solo si cambia la topología del sistema, y
eso es una decisión del dueño, no un efecto de un feature.

## 11. Estado

- [x] Fase 1 (pre-backfill) y fase 2 (backfill) cerradas.
- [x] Sección del gate en `04-verificacion`: obligación y puntero a §4.
- [x] A5 publicado y `wiki/README` corregidos: el registro ya no declara el mantenimiento como hueco.
- [ ] Aclaración en `00-stack` (el ciclo del wiki es de verificación del tile, no una ruta por
      feature) — pendiente; disparador: el próximo ciclo que cambie la topología o el mapa de tiles.
- [ ] Propósito de registro actualizado en `decisiones` §20 — pendiente; disparador: la próxima
      edición de `§20`.
- [ ] Piloto con el primer ciclo de feature real (§9).
