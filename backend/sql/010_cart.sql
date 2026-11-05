-- 010_cart.sql — el carrito de seleccionados y su solicitud por WhatsApp (ciclo 4e, `cart-request`).
-- Fuente única del modelo: `.plans/modelo-datos-app-mudanzapp.md` §1 y decisión §44.
--
-- Solo hacia adelante e idempotente: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`,
-- `CREATE INDEX IF NOT EXISTS` y, para la restricción que no admite `IF NOT EXISTS`, un bloque `DO`
-- que consulta `pg_constraint` por nombre antes de añadirla (nota E5 de `.guidelines/04` §3). Sin
-- `DROP`, sin transacción propia (el runner abre una por archivo) y sin tabla de seguimiento.
--
-- El carrito es del servidor y `localStorage` solo lo pinta: la tabla es la verdad (decisión §39).
-- La solicitud es un hecho **aparte** —con su instantánea de título y precio— y no un estado del
-- carrito, porque el comprador puede volver a pedir después de que el vendedor la descarte.
--
-- `app.purchase_interest` **no se crea**: la decisión §38 quedó superada por la §44 y el carrito con
-- su solicitud guardan el hecho. `event.contact_phone` es del **vendedor**, no del visitante, y se
-- guarda solo con dígitos porque `wa.me` no acepta `+`, espacios ni guiones.

ALTER TABLE app.event ADD COLUMN IF NOT EXISTS contact_phone text;

-- Nulo es «sin WhatsApp configurado»: el botón del carrito no se habilita y el borde responde
-- `whatsapp_not_configured`. La forma es la misma que `WHATSAPP_NUMBER_PATTERN` en `shared`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'app'
       AND t.relname = 'event'
       AND c.conname = 'event_contact_phone_check'
  ) THEN
    ALTER TABLE app.event
      ADD CONSTRAINT event_contact_phone_check
      CHECK (contact_phone IS NULL OR contact_phone ~ '^[0-9]{8,15}$');
  END IF;
END
$$;

-- Un carrito por comprador y evento: el `PUT` lo reemplaza entero, así que reintentar es idempotente.
CREATE TABLE IF NOT EXISTS app.cart (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app."user" (id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES app.event (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_owner_key UNIQUE (user_id, event_id)
);

-- Un artículo guardado: la clave compuesta impide duplicarlo sin necesidad de un `SELECT` previo.
CREATE TABLE IF NOT EXISTS app.cart_item (
  cart_id uuid NOT NULL REFERENCES app.cart (id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES app.listing (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_item_key PRIMARY KEY (cart_id, listing_id)
);

-- La cascada de `app.listing` busca las filas del carrito por `listing_id`; sin este índice cada
-- borrado de una captura recorrería la tabla entera.
CREATE INDEX IF NOT EXISTS cart_item_listing_idx ON app.cart_item (listing_id);

-- La solicitud conserva su rastro después de atendida: el comprador puede volver a pedir y cada
-- intento es una fila. `dismissed_by` no lleva `ON DELETE`: un usuario no se borra y, si algún día se
-- borrara, la clave foránea debe impedirlo en vez de vaciar el autor del acto en silencio.
CREATE TABLE IF NOT EXISTS app.cart_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES app.cart (id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  dismissed_by uuid REFERENCES app."user" (id),
  cancelled_at timestamptz,
  CONSTRAINT cart_request_dismissed_check CHECK (
    (dismissed_at IS NULL AND dismissed_by IS NULL) OR
    (dismissed_at IS NOT NULL AND dismissed_by IS NOT NULL)
  )
);

-- Una sola solicitud abierta por carrito: es lo que hace idempotente el reintento del comprador y lo
-- que impide que dos peticiones simultáneas creen dos renglones que el vendedor no podría distinguir.
CREATE UNIQUE INDEX IF NOT EXISTS cart_request_open_idx ON app.cart_request (cart_id)
  WHERE dismissed_at IS NULL AND cancelled_at IS NULL;

-- La instantánea de lo que el comprador pidió: título y precio de ese momento. `listing_id` pasa a
-- nulo si el vendedor borra el artículo, y la solicitud sigue siendo evidencia (decisión §38).
CREATE TABLE IF NOT EXISTS app.cart_request_item (
  request_id uuid NOT NULL REFERENCES app.cart_request (id) ON DELETE CASCADE,
  position smallint NOT NULL,
  listing_id uuid REFERENCES app.listing (id) ON DELETE SET NULL,
  title_snapshot text NOT NULL,
  price_cents_snapshot integer NOT NULL,
  CONSTRAINT cart_request_item_key PRIMARY KEY (request_id, position)
);
