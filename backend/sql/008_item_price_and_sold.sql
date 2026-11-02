-- 008_item_price_and_sold.sql — precio del artículo y venta de la publicación (ciclo 4b).
-- Fuente única del modelo: `.plans/modelo-datos-app-mudanzapp.md` §1 y decisiones §35 y §40.
--
-- Solo hacia adelante e idempotente: `IF NOT EXISTS` donde el DDL lo permite y, para el `CHECK`, un
-- bloque `DO` que consulta `pg_constraint` por nombre antes de añadirlo (nota E5 de `.guidelines/04`
-- §3). Sin `DROP`, sin transacción propia (el runner abre una por archivo) y **sin relleno**: los
-- artículos publicados antes de este corte quedan con precio nulo y ninguna migración escribe valores.
--
-- `price_cents` es un entero en la moneda de `app.event.currency`; el máximo vive en `shared` y no en
-- el DDL. `sold_at` marca la venta sin monto y sin exigir precio: vender no es borrar (decisión §40).

ALTER TABLE app.item ADD COLUMN IF NOT EXISTS price_cents integer;

ALTER TABLE app.listing ADD COLUMN IF NOT EXISTS sold_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'app'
       AND t.relname = 'item'
       AND c.conname = 'item_price_cents_check'
  ) THEN
    ALTER TABLE app.item
      ADD CONSTRAINT item_price_cents_check
      CHECK (price_cents IS NULL OR price_cents >= 0);
  END IF;
END
$$;
