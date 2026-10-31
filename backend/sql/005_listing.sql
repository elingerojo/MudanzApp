-- 005_listing.sql — corte de publicación del artículo (ciclo 3c, `publish`).
-- Fuente única del modelo: `.plans/modelo-datos-app-mudanzapp.md` §1.
--
-- Solo hacia adelante e idempotente: `IF NOT EXISTS` en tablas e índices, sin `DROP`, sin transacción
-- propia (el runner abre una por archivo) y sin tabla de seguimiento.
--
-- El estado publicado vive aquí y no en `app.item`: un artículo sin fila no está publicado, y la
-- restricción de unicidad por artículo hace que republicar sea idempotente. `slug` es la dirección
-- pública y no cambia con el título: una URL compartida es un hecho publicado, no un espejo de la
-- ficha.

CREATE TABLE IF NOT EXISTS app.listing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES app.item (id) ON DELETE CASCADE,
  slug text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_item_key UNIQUE (item_id),
  CONSTRAINT listing_slug_key UNIQUE (slug),
  CONSTRAINT listing_slug_check CHECK (
    char_length(slug) BETWEEN 3 AND 140 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
);

-- La lista pública del ciclo 4 se lee de más reciente a más antiguo.
CREATE INDEX IF NOT EXISTS listing_published_idx ON app.listing (published_at DESC);
