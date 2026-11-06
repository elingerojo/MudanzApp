-- 013_listing_unpublish.sql — despublicar un artículo sin borrar la captura (ciclo F3).
-- Fuente única del modelo: `.plans/modelo-datos-app-mudanzapp.md` §1.
--
-- Solo hacia adelante e idempotente: `ADD COLUMN IF NOT EXISTS`, sin `DROP`, sin transacción propia
-- (el runner abre una por archivo) y sin tabla de seguimiento.
--
-- Despublicar **no** borra la fila de `app.listing`: la captura, su foto y su `slug` se conservan, y
-- republicar restaura la misma URL. Una fila con `unpublished_at` no es una ficha pública: el borde
-- responde `410 listing_unpublished` y el índice del evento no la enumera. El carrito conserva la
-- referencia y el borde la retira con su aviso (decisión del dueño, 2026-11-06).
--
-- El instante se escribe una sola vez: reintentar la despublicación no reescribe la evidencia.

ALTER TABLE app.listing ADD COLUMN IF NOT EXISTS unpublished_at timestamptz;
