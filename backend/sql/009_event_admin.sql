-- 009_event_admin.sql — el event-administrator del evento (ciclo 4c-2, `event-admin`).
-- Fuente única del modelo: `.plans/modelo-datos-app-mudanzapp.md` §1 y decisión §37.
--
-- Solo hacia adelante e idempotente: `IF NOT EXISTS` donde el DDL lo permite y, para la clave foránea,
-- un bloque `DO` que consulta `pg_constraint` por nombre antes de añadirla (nota E5 de `.guidelines/04`
-- §3). Sin `DROP`, sin transacción propia (el runner abre una por archivo) y **sin relleno**: los
-- eventos anteriores a este corte quedan sin administrador hasta que una cuenta los reclame, y
-- `is_admin` es la puerta de arranque. Escribir un valor aquí elegiría por el dueño.
--
-- `admin_user_id` admite nulo a propósito: el evento existe antes de que nadie lo reclame, y el reclamo
-- es la primera autenticación de cuenta que llega desde una sesión de ese evento. La columna **no**
-- lleva índice —se lee con la fila del evento que ya se consulta— ni unicidad: un usuario puede
-- administrar varios eventos, y un evento tiene un solo administrador por la forma del dato, no por un
-- índice.

ALTER TABLE app.event ADD COLUMN IF NOT EXISTS admin_user_id uuid;

-- Sin `ON DELETE`: un usuario no se borra. Si algún día se borrara, la clave foránea debe impedirlo en
-- vez de vaciar el evento en silencio.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'app'
       AND t.relname = 'event'
       AND c.conname = 'event_admin_user_fkey'
  ) THEN
    ALTER TABLE app.event
      ADD CONSTRAINT event_admin_user_fkey
      FOREIGN KEY (admin_user_id) REFERENCES app."user" (id);
  END IF;
END
$$;
