-- 007_event_public_slug.sql — identificador público del evento (ciclo 4a, `event-index`).
-- Fuente única del modelo: `.plans/modelo-datos-app-mudanzapp.md` §1 y decisión §36.
--
-- Solo hacia adelante e idempotente: `IF NOT EXISTS` donde el DDL lo permite y, para el `CHECK`, un
-- bloque `DO` que consulta `pg_constraint` por nombre antes de añadirlo (nota E5 de `.guidelines/04`
-- §3). Sin `DROP`, sin transacción propia (el runner abre una por archivo) y **sin relleno**: los
-- eventos anteriores ganan su `public_slug` de forma perezosa, la primera vez que se leen, y no en
-- esta migración. Escribir datos aquí obligaría a conocer la regla de derivación en SQL, que es del
-- código (`shared/src/event.ts`).
--
-- `public_slug` es nulo mientras el evento no lo haya estrenado: la columna admite nulo a propósito
-- y el índice único deja pasar cualquier número de filas nulas. Una vez emitido **no se reescribe**:
-- la URL pública de un evento es un hecho permanente (decisión §36).

ALTER TABLE app.event ADD COLUMN IF NOT EXISTS public_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS event_public_slug_key ON app.event (public_slug);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'app'
       AND t.relname = 'event'
       AND c.conname = 'event_public_slug_check'
  ) THEN
    ALTER TABLE app.event
      ADD CONSTRAINT event_public_slug_check
      CHECK (
        public_slug IS NULL
        OR (char_length(public_slug) BETWEEN 3 AND 140 AND public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
      );
  END IF;
END
$$;

-- El índice del evento se lee por `event_id` y hasta este corte no existía: sin él, listar las
-- publicaciones de un evento recorre `app.item` entero.
CREATE INDEX IF NOT EXISTS item_event_id_idx ON app.item (event_id);
