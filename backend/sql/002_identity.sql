-- 002_identity.sql — tablas del corte de identidad del ciclo 1.
-- Fuente única del modelo: `.plans/modelo-datos-app-mudanzapp.md` §1.
-- Solo hacia adelante e idempotente: `IF NOT EXISTS` en tablas e índices, sin `DROP`, sin
-- transacción propia (el runner abre una por archivo) y sin tabla de seguimiento.

CREATE TABLE IF NOT EXISTS app."user" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  account_status text NOT NULL DEFAULT 'active',
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Un solo administrador (modelo §1). El índice parcial deja fuera a los no administradores.
CREATE UNIQUE INDEX IF NOT EXISTS user_single_admin
  ON app."user" (is_admin)
  WHERE is_admin;

CREATE TABLE IF NOT EXISTS app.auth_factor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app."user" (id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'oauth',
  issuer text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT auth_factor_issuer_subject_key UNIQUE (issuer, subject)
);

CREATE INDEX IF NOT EXISTS auth_factor_user_id_idx ON app.auth_factor (user_id);

CREATE TABLE IF NOT EXISTS app.event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES app."user" (id),
  origin_city text NOT NULL,
  destination_city text NOT NULL,
  currency text NOT NULL DEFAULT 'MXN',
  state text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_owner_user_id_idx ON app.event (owner_user_id);

CREATE TABLE IF NOT EXISTS app.invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES app.event (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_by uuid NOT NULL REFERENCES app."user" (id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by uuid REFERENCES app."user" (id),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitation_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS invitation_event_id_idx ON app.invitation (event_id);

CREATE TABLE IF NOT EXISTS app.session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app."user" (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  scope text NOT NULL,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT session_token_hash_key UNIQUE (token_hash),
  CONSTRAINT session_scope_check CHECK (scope IN ('app', 'shop'))
);

CREATE INDEX IF NOT EXISTS session_user_id_idx ON app.session (user_id);

CREATE TABLE IF NOT EXISTS app.event_member (
  event_id uuid NOT NULL REFERENCES app.event (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app."user" (id) ON DELETE CASCADE,
  role text NOT NULL,
  invited_by uuid REFERENCES app."user" (id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_member_pkey PRIMARY KEY (event_id, user_id),
  CONSTRAINT event_member_role_check CHECK (role IN ('owner', 'member'))
);

CREATE INDEX IF NOT EXISTS event_member_user_id_idx ON app.event_member (user_id);
