-- 006_item_photo_variant.sql — la foto en tres tamaños estándar (ciclo 3c-optimizar).
-- Fuente única del modelo: `.plans/modelo-datos-app-mudanzapp.md` §1 y §9.
--
-- Solo hacia adelante e idempotente: `IF NOT EXISTS` en tablas e índices, sin `DROP`, sin transacción
-- propia (el runner abre una por archivo) y sin tabla de seguimiento.
--
-- Una fila por (foto, variante). Aquí vive el objeto de cada tamaño; `app.item_photo` no cambia de
-- forma y sus columnas heredadas (`object_key`, `content_type`, `byte_size`) describen el tamaño
-- `large`, que es el que la subida de esa variante sigue escribiendo.
--
-- **La tabla no guarda el peso ni impone reglas de tamaño o de peso.** Guarda la clave del objeto, su
-- tipo y sus dimensiones reales, que es lo que `shop` necesita para reservar la caja de la imagen. La
-- única regla de tamaño es la del código (`ITEM_PHOTO_SIZES`) y la única de peso es un objetivo del
-- codificador del dispositivo: nadie lo verifica después.

CREATE TABLE IF NOT EXISTS app.item_photo_variant (
  photo_id uuid NOT NULL REFERENCES app.item_photo (id) ON DELETE CASCADE,
  variant text NOT NULL,
  object_key text NOT NULL,
  content_type text NOT NULL,
  width_px integer NOT NULL,
  height_px integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_photo_variant_pkey PRIMARY KEY (photo_id, variant),
  CONSTRAINT item_photo_variant_object_key_key UNIQUE (object_key),
  CONSTRAINT item_photo_variant_name_check CHECK (variant IN ('thumb', 'medium', 'large')),
  CONSTRAINT item_photo_variant_content_type_check
    CHECK (content_type IN ('image/jpeg', 'image/webp'))
);
