-- 012_invitation_label.sql — el nombre humano de cada invitación (corte 4c-fix).
-- Fuente única del modelo: `.plans/modelo-datos-app-mudanzapp.md` §1 y decisión §42.
--
-- Solo hacia adelante e idempotente: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, un
-- `UPDATE` acotado por `WHERE label IS NULL` y un `INSERT ... ON CONFLICT DO NOTHING` que no retrocede
-- el puntero de una base ya en uso. Sin `DROP` y sin tabla de seguimiento de migraciones (nota E5 de
-- `.guidelines/04` §3).
--
-- La columna admite nulo a propósito: una emisión del build anterior durante la ventana entre migrar y
-- desplegar no puede fallar. El panel la pinta como «Sin etiqueta».
--
-- El anillo de 20 palabras vive en `backend/src/domain/invitation-label.ts`; aquí se repite una vez,
-- congelado, para rellenar las filas anteriores a este corte. Un archivo aplicado no se edita.

ALTER TABLE app.invitation ADD COLUMN IF NOT EXISTS label text;

-- El puntero del anillo: una sola fila posible (`id` booleana con `CHECK (id)`), sin índice nuevo.
-- Se lee y se avanza dentro de la transacción de la emisión, con `FOR UPDATE` (`issueInvitation`).
CREATE TABLE IF NOT EXISTS app.invitation_label_sequence (
  id boolean PRIMARY KEY DEFAULT true,
  last_label text,
  advanced_at timestamptz,
  CONSTRAINT invitation_label_sequence_singleton CHECK (id)
);

-- Relleno cronológico global: la primera invitación recibe `caja`, la segunda `flete`, y así hasta la
-- vigésima. Idempotente porque solo toca las filas sin etiqueta.
WITH words AS (
  SELECT ARRAY['caja','flete','manta','soga','cinta','guante','diario','radio','silla','mesa',
               'plato','vaso','cubo','percha','colchon','libro','juguete','lampara','cortina',
               'alfombra']::text[] AS list
), ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS position
  FROM app.invitation
  WHERE label IS NULL
)
UPDATE app.invitation AS invitation
SET label = words.list[1 + (((ranked.position - 1) % 20)::int)]
FROM ranked, words
WHERE invitation.id = ranked.id;

-- Semilla del puntero: la última palabra que dejó el relleno, para que la siguiente emisión continúe el
-- anillo. `ON CONFLICT DO NOTHING` es lo que impide que volver a correr el runner devuelva el anillo a
-- `caja` en cada corrida.
INSERT INTO app.invitation_label_sequence (id, last_label, advanced_at)
SELECT true,
       (SELECT label FROM app.invitation WHERE label IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1),
       now()
ON CONFLICT (id) DO NOTHING;
