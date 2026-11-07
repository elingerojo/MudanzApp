# Bandeja de ideas

> **Rol:** entrada cruda de ideas que todavía no son alcance. El triage las convierte en fila del
> backlog, en hecho pendiente del dueño o en nada.
> **No es:** backlog, fuente de alcance ni promesa. Anotar aquí no autoriza construir
> ([`01-scope`](../.roo/rules/01-scope.md:1)).
> **Dueño:** Architect. **Revisión:** dueño del proyecto. **Fecha:** 2026-11-06.
> **Procedimiento:** [`workflow-ciclos`](workflow-ciclos.md:1) §3.

## 1. Reglas

- Se escribe **sin id, sin costo y sin formato**: una línea por idea, con fecha ISO.
- El triage ocurre fuera de un ciclo. No es un ciclo y no escribe código.
- Un hallazgo durante un ciclo entra aquí; el corte en curso no se amplía.
- Un ítem sale de la bandeja cuando tiene destino escrito, y **se borra** de la tabla.
- No se siembra con ideas inventadas: la primera fila la pone el dueño.

## 2. Bandeja

| #   | Fecha      | Idea                                                                                                                                                                                                                                                                                                                                                                | Clase      | Superficie probable | Triage     |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- | ---------- |
| 1   | 2026-11-06 | El aviso `cart-unpublished` vive solo en memoria: al recargar, el artículo ya no está en el carrito y el comprador no sabe por qué desapareció. Un tombstone o una instantánea lo harían durable.                                                                                                                                                                   | `deuda`    | `shop` carrito      | sin triage |
| 2   | 2026-11-06 | Un comprador anónimo conserva en `localStorage` un artículo despublicado y nunca ve el aviso: la unión con el servidor ocurre solo al entrar a la cuenta de tienda.                                                                                                                                                                                                 | `deuda`    | `shop` carrito      | sin triage |
| 3   | 2026-11-06 | `smoke.spec.ts` corre en los tres proyectos y exige `status-process` y `status-database` en `/`; en `wiki` el humo vive en `/estado` y `/` es el índice, así que el proyecto falla.                                                                                                                                                                                 | `deuda`    | `e2e` / `wiki`      | sin triage |
| 4   | 2026-11-06 | La prueba de wiki de `ai-draft.spec.ts` navega a `/foto-a-ficha`, ruta que el mapa de `wiki` ya no publica; la prueba y el mapa deben volver a coincidir.                                                                                                                                                                                                           | `deuda`    | `e2e` / `wiki`      | sin triage |
| 5   | 2026-11-06 | El borrado duro no avisa al carrito: la cascada de `app.cart_item` borra la fila sin dejar rastro. Un tombstone o una instantánea lo resolverían si el producto lo pide.                                                                                                                                                                                            | `producto` | `api` / `shop`      | sin triage |
| 6   | 2026-11-06 | Un artículo despublicado sigue visible hasta 60 s en la copia del Worker (`max-age=60`); el `410` llega cuando expira la instantánea, no cuando el vendedor actúa.                                                                                                                                                                                                  | `deuda`    | `shop` worker       | sin triage |
| 7   | 2026-11-06 | La primera corrida de `test:api:db` escribió filas de prueba en la base local `main` por el `--test` ausente del script: limpiar esas filas o reconstruir el sandbox local.                                                                                                                                                                                         | `deuda`    | datos locales       | sin triage |
| 8   | 2026-11-07 | `test/db/item-photos.test.ts` usa tres tokens fijos y no limpia sus sesiones: la segunda corrida contra el mismo sandbox choca con `session_token_hash_key` y el gate de base no se puede repetir sin vaciar `app."session"` a mano.                                                                                                                                | `deuda`    | `api` / `e2e`       | sin triage |
| 9   | 2026-11-07 | `ng serve` puede servir un bundle viejo desde `frontend/.angular/cache`: `test:e2e:branch` deja de montar `/cuenta/evento` —el `GET /events/:id/dashboard` responde `200` y el chunk perezoso del panel nunca se pide— aunque el código sea correcto; `npx ng cache clean` lo resuelve. Limpiar la caché en `run-e2e.ts` o documentarla como paso previo del arnés. | `deuda`    | `e2e` / tooling     | sin triage |

## 3. Clases

| Clase            | Qué es                                               | Destino natural                                |
| ---------------- | ---------------------------------------------------- | ---------------------------------------------- |
| `producto`       | Una capacidad nueva del negocio                      | Fila del backlog con costo S/M/L               |
| `corte`          | Una parte de un ciclo ya declarado                   | Fila del backlog o §3.1 de `resumen-funcional` |
| `deuda`          | Corrección técnica sin cambio de alcance             | Fila del backlog, bloque C, D o T              |
| `doc`            | Un documento que contradice el código o una decisión | Su propio corte `docs`, o §10 del plan vigente |
| `hecho de dueño` | Una decisión que solo el dueño puede tomar           | `resumen-funcional` §6                         |

## 4. Triage

| Resultado        | Se escribe en                                       | Se borra de aquí |
| ---------------- | --------------------------------------------------- | ---------------- |
| Candidata        | fila del backlog con id, costo, fuente y disparador | sí               |
| Ya existe        | la fila existente gana la evidencia nueva           | sí               |
| Fuera de alcance | fila X con el disparador que la revisaría           | sí               |
| Hecho de dueño   | `resumen-funcional` §6 con dueño y disparador       | sí               |
| Ruido            | nada                                                | sí               |

## 5. Cómo se añade

Una fila al final de §2 con la fecha de hoy en ISO, la idea en una frase y la clase si se sabe. El
orden de la tabla no es prioridad.
