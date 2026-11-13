-- 014_event_onboarding_level.sql — nivel de onboarding del evento (corte 3k).
-- Fuente única del modelo: `.plans/modelo-datos-app-mudanzapp.md` §1.
--
-- Solo hacia adelante e idempotente: `ADD COLUMN IF NOT EXISTS` y una restricción creada solo si no
-- existe, sin `DROP`, sin transacción propia (el runner abre una por archivo) y sin tabla de
-- seguimiento.
--
-- `NULL` significa «sin elección»: el nivel efectivo se deriva de cuántos artículos del evento se
-- publicaron alguna vez (`app.listing` conserva la fila al despublicar y al vender). El `smallint`
-- deja agregar el nivel 2 sin migrar; el rango `0..9` es la red de seguridad y el máximo real vive
-- en `ONBOARDING_LEVELS` (`shared`), que es lo que valida la frontera HTTP.

ALTER TABLE app.event
  ADD COLUMN IF NOT EXISTS onboarding_level smallint;

-- Forma idempotente equivalente, sin `DROP`: la restricción se crea solo si no existe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'event_onboarding_level_check'
       AND conrelid = 'app.event'::regclass
  ) THEN
    ALTER TABLE app.event
      ADD CONSTRAINT event_onboarding_level_check
      CHECK (onboarding_level IS NULL OR onboarding_level BETWEEN 0 AND 9);
  END IF;
END $$;
