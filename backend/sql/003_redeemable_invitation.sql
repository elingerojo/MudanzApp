-- 003_redeemable_invitation.sql — corte de la invitación acotada y la sesión de evento
-- (`decisiones` §30). Fuente única del modelo: `.plans/modelo-datos-app-mudanzapp.md` §1.
--
-- Forma idempotente equivalente (`.guidelines/04` §3, nota E5): todo el DDL se puede reejecutar.
-- `ADD COLUMN IF NOT EXISTS`, el `UPDATE` condicionado y el bloque `DO` que consulta
-- `pg_constraint` no necesitan tabla de seguimiento.
--
-- Excepción razonable al veto de `DROP`: `ALTER COLUMN ... DROP NOT NULL` no destruye datos, no
-- borra objetos y es idempotente. Sin él no existe forma de que una sesión de evento no tenga
-- sujeto, que es justo lo que este corte añade.
--
-- `expires_at` de las invitaciones existentes no se reescribe: las 72 horas rigen solo para las que
-- se emitan después de este archivo.

-- 1. La invitación cuenta sus canjes y marca el reclamo con cuenta.
ALTER TABLE app.invitation
  ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0;

ALTER TABLE app.invitation
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Las invitaciones consumidas antes de este archivo tuvieron un canje: la columna nace en cero y se
-- corrige solo donde la evidencia vieja dice que hubo uno.
UPDATE app.invitation
   SET use_count = 1
 WHERE consumed_at IS NOT NULL
   AND use_count = 0;

-- 2. La sesión es de cuenta (sujeto) o de evento (sin sujeto): nunca ambas y nunca ninguna.
ALTER TABLE app.session
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES app.event (id) ON DELETE CASCADE;

ALTER TABLE app.session
  ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'session_owner_check'
       AND conrelid = 'app.session'::regclass
  ) THEN
    ALTER TABLE app.session
      ADD CONSTRAINT session_owner_check CHECK (
        (user_id IS NOT NULL AND event_id IS NULL)
        OR (user_id IS NULL AND event_id IS NOT NULL)
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS session_event_id_idx ON app.session (event_id);
