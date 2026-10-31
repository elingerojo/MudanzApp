-- 004_item.sql — corte de captura del artículo (ciclo 3a, `capture`).
-- Fuente única del modelo: `.plans/modelo-datos-app-mudanzapp.md` §1.
--
-- Solo hacia adelante e idempotente: `IF NOT EXISTS` en tablas, índices y restricciones, sin `DROP`,
-- sin transacción propia (el runner abre una por archivo) y sin tabla de seguimiento.
--
-- Los bytes de la foto no viven aquí: esta tabla guarda la referencia (`object_key`) y los datos con
-- los que el backend pide el objeto al almacén (`R2_MODE`). La lectura pública de esa foto no existe
-- todavía: en este corte se sirve solo con sesión del evento (decisión §26, diferida a `publish`).

CREATE TABLE IF NOT EXISTS app.item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES app.event (id) ON DELETE CASCADE,
  title text NOT NULL,
  note text,
  width_cm integer,
  height_cm integer,
  depth_cm integer,
  weight_kg numeric(8, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT item_note_check CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT item_measure_check CHECK (
    (width_cm IS NULL OR width_cm > 0) AND
    (height_cm IS NULL OR height_cm > 0) AND
    (depth_cm IS NULL OR depth_cm > 0) AND
    (weight_kg IS NULL OR weight_kg > 0)
  )
);

-- La lista del evento se lee por evento y de más reciente a más antiguo.
CREATE INDEX IF NOT EXISTS item_event_created_idx ON app.item (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.item_photo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES app.item (id) ON DELETE CASCADE,
  object_key text NOT NULL,
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_photo_object_key_key UNIQUE (object_key),
  CONSTRAINT item_photo_position_key UNIQUE (item_id, position),
  CONSTRAINT item_photo_content_type_check
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT item_photo_size_check CHECK (byte_size > 0),
  CONSTRAINT item_photo_position_check CHECK (position >= 0)
);
