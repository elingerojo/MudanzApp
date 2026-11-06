import { randomUUID } from 'node:crypto';

import type { EventRole, SessionScope } from '@mudanzapp/shared';

import type { Database, Queryable } from '../db.js';
import { eventPublicSlug, eventPublicSlugRetry } from '../domain/event.js';
import { nextInvitationLabel } from '../domain/invitation-label.js';

/**
 * Acceso a datos del corte de identidad, en SQL crudo y parametrizado (`modelo-datos` §2).
 *
 * Cada función recibe la superficie de consulta (`Queryable`), de modo que la misma sentencia sirve
 * al pool y al cliente de una transacción. No hay ORM ni query builder que oculte el SQL.
 */

// Se usan alias y no `interface` a propósito: `pg` exige `QueryResultRow` (un índice de columnas) y
// los alias de objeto literales lo satisfacen sin un cast.
export type UserRecord = {
  readonly id: string;
  readonly displayName: string;
  readonly isAdmin: boolean;
};

/**
 * El evento con su identificador público. `publicSlug` es `null` en un evento anterior al ciclo 4a:
 * la derivación es **perezosa** y se persiste una sola vez, la primera vez que el evento se lee
 * (`plan-ciclo-4a` §3). El `CHECK` y el índice único admiten ese nulo a propósito.
 *
 * `adminUserId` es el event-administrator reclamado (ciclo 4c-2, decisión §37): `null` mientras nadie
 * lo reclame. Viaja en la misma fila que el evento porque se lee con ella; por eso la columna no lleva
 * índice.
 */
export type EventRecord = {
  readonly id: string;
  readonly publicSlug: string | null;
  readonly adminUserId: string | null;
  readonly originCity: string;
  readonly destinationCity: string;
  readonly currency: string;
  readonly state: string;
};

/** El evento ya con su identificador público resuelto: lo que el contrato puede publicar. */
export type EventWithPublicSlug = EventRecord & { readonly publicSlug: string };

export type EventMembershipRecord = EventRecord & {
  readonly role: EventRole;
};

const EVENT_COLUMNS =
  'id, public_slug AS "publicSlug", admin_user_id AS "adminUserId", ' +
  'origin_city AS "originCity", destination_city AS "destinationCity", currency, state';

/** ¿El índice único del `public_slug` rechazó la escritura? Es la única colisión que se reintenta. */
function isPublicSlugConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const { code, constraint } = error as { readonly code?: unknown; readonly constraint?: unknown };
  if (code !== '23505') {
    return false;
  }

  return constraint === undefined || constraint === 'event_public_slug_key';
}

export type InvitationRecord = {
  readonly id: string;
  readonly eventId: string;
  readonly createdBy: string;
  readonly expiresAt: Date;
  readonly useCount: number;
  readonly consumedAt: Date | null;
  readonly claimedAt: Date | null;
  readonly revokedAt: Date | null;
};

export type FactorRecord = {
  readonly factorId: string;
  readonly user: UserRecord;
};

export type SessionRecord = {
  readonly id: string;
  readonly userId: string | null;
  readonly eventId: string | null;
  readonly scope: SessionScope;
  readonly revokedAt: Date | null;
  readonly user: UserRecord | null;
};

export type EventSessionRecord = {
  readonly id: string;
  readonly userId: string | null;
  readonly userDisplayName: string | null;
  readonly scope: SessionScope;
  readonly deviceLabel: string | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date | null;
  readonly revokedAt: Date | null;
};

/**
 * Una invitación del evento tal como el panel la publica (ciclo 4c-3).
 *
 * `token_hash` **no** está: la capacidad se muestra una sola vez, al emitirla, y desde entonces solo
 * vive como hash. El panel necesita el hecho —cuándo vence, cuántos canjes lleva y si se canceló—, no
 * el secreto.
 */
export type EventInvitationRecord = {
  readonly id: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly useCount: number;
  readonly revokedAt: Date | null;
  /** El nombre humano del enlace (corte 4c-fix); `null` solo en una fila anterior a la migración. */
  readonly label: string | null;
};

const USER_COLUMNS = 'id, display_name AS "displayName", is_admin AS "isAdmin"';

/**
 * Garantiza el administrador único. La idempotencia viene del índice parcial de la migración: dos
 * llamadas concurrentes pueden intentar insertar, pero solo una fila `is_admin` sobrevive.
 */
export async function ensureAdminUser(database: Queryable): Promise<UserRecord | null> {
  await database.query(
    `INSERT INTO app."user" (display_name, is_admin)
     SELECT 'Administrador', true
     WHERE NOT EXISTS (SELECT 1 FROM app."user" WHERE is_admin)
     ON CONFLICT DO NOTHING`,
  );

  const { rows } = await database.query<UserRecord>(
    `SELECT ${USER_COLUMNS} FROM app."user" WHERE is_admin LIMIT 1`,
  );

  return rows[0] ?? null;
}

/**
 * Crea el evento y **estrena** su `public_slug` en la misma escritura (decisión §36): el enlace
 * público existe desde el minuto cero, antes de que haya artículos.
 *
 * El identificador se genera aquí y no en la base porque el sufijo del `slug` sale de él. Si el
 * índice único rechaza la primera forma —dos trayectos idénticos con el mismo prefijo—, se reintenta
 * con ocho caracteres del mismo identificador; un tercer fallo es un error real y se propaga.
 */
export async function createEvent(
  database: Queryable,
  input: {
    readonly ownerUserId: string;
    readonly originCity: string;
    readonly destinationCity: string;
    readonly currency: string;
  },
): Promise<EventRecord> {
  const eventId = randomUUID();

  const insert = async (publicSlug: string): Promise<EventRecord> => {
    const { rows } = await database.query<EventRecord>(
      `INSERT INTO app.event (id, owner_user_id, origin_city, destination_city, currency, public_slug)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${EVENT_COLUMNS}`,
      [
        eventId,
        input.ownerUserId,
        input.originCity,
        input.destinationCity,
        input.currency,
        publicSlug,
      ],
    );

    const event = rows[0];
    if (event === undefined) {
      throw new Error('event-insert-returned-no-row');
    }

    return event;
  };

  let event: EventRecord;
  try {
    event = await insert(eventPublicSlug(input.originCity, input.destinationCity, eventId));
  } catch (error: unknown) {
    if (!isPublicSlugConflict(error)) {
      throw error;
    }

    event = await insert(eventPublicSlugRetry(input.originCity, input.destinationCity, eventId));
  }

  await database.query(
    `INSERT INTO app.event_member (event_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT DO NOTHING`,
    [event.id, input.ownerUserId],
  );

  return event;
}

/**
 * Deriva y persiste el `public_slug` de un evento anterior al ciclo 4a, **una sola vez**.
 *
 * La escritura condicional (`WHERE public_slug IS NULL`) es la que hace segura la carrera: el que
 * pierde no escribe nada y relee lo que ganó el otro. Un evento que ya tiene su identificador no
 * toca la base.
 */
export async function ensureEventPublicSlug(
  database: Queryable,
  event: EventRecord,
): Promise<EventWithPublicSlug> {
  if (event.publicSlug !== null) {
    return { ...event, publicSlug: event.publicSlug };
  }

  const first = await persistPublicSlug(
    database,
    event.id,
    eventPublicSlug(event.originCity, event.destinationCity, event.id),
  );
  if (first !== null) {
    return { ...event, publicSlug: first };
  }

  const existing = await readPublicSlug(database, event.id);
  if (existing !== null) {
    return { ...event, publicSlug: existing };
  }

  const retried = await persistPublicSlug(
    database,
    event.id,
    eventPublicSlugRetry(event.originCity, event.destinationCity, event.id),
  );
  const resolved = retried ?? (await readPublicSlug(database, event.id));
  if (resolved === null) {
    throw new Error('event-public-slug-unresolved');
  }

  return { ...event, publicSlug: resolved };
}

/**
 * Rellena de una vez los eventos que todavía no estrenaron su `public_slug`. Se usa en el camino de
 * fallo de la lectura pública: un enlace emitido antes del corte tiene que encontrar su evento sin
 * que nadie tenga que abrir la superficie privada primero.
 */
export async function backfillEventPublicSlugs(database: Queryable): Promise<number> {
  const { rows } = await database.query<EventRecord>(
    `SELECT ${EVENT_COLUMNS} FROM app.event WHERE public_slug IS NULL`,
  );

  let changed = 0;
  for (const event of rows) {
    await ensureEventPublicSlug(database, event);
    changed += 1;
  }

  return changed;
}

async function persistPublicSlug(
  database: Queryable,
  eventId: string,
  publicSlug: string,
): Promise<string | null> {
  try {
    const { rows } = await database.query<{ readonly publicSlug: string }>(
      `UPDATE app.event
          SET public_slug = $2
        WHERE id = $1
          AND public_slug IS NULL
        RETURNING public_slug AS "publicSlug"`,
      [eventId, publicSlug],
    );

    return rows[0]?.publicSlug ?? null;
  } catch (error: unknown) {
    if (isPublicSlugConflict(error)) {
      return null;
    }

    throw error;
  }
}

async function readPublicSlug(database: Queryable, eventId: string): Promise<string | null> {
  const { rows } = await database.query<{ readonly publicSlug: string | null }>(
    `SELECT public_slug AS "publicSlug" FROM app.event WHERE id = $1`,
    [eventId],
  );

  return rows[0]?.publicSlug ?? null;
}

export async function findEventById(
  database: Queryable,
  eventId: string,
): Promise<EventRecord | null> {
  const { rows } = await database.query<EventRecord>(
    `SELECT ${EVENT_COLUMNS} FROM app.event WHERE id = $1`,
    [eventId],
  );

  return rows[0] ?? null;
}

/**
 * Dueño del evento: el invitante de registro de toda membresía (`decisiones` §30). Es una consulta
 * escalar y no un campo de `EventRecord`, para no arrastrar la columna a las tres lecturas que solo
 * necesitan la vista del evento. `null` significa que el evento no existe.
 */
export async function findEventOwnerUserId(
  database: Queryable,
  eventId: string,
): Promise<string | null> {
  const { rows } = await database.query<{ ownerUserId: string }>(
    `SELECT owner_user_id AS "ownerUserId" FROM app.event WHERE id = $1`,
    [eventId],
  );

  return rows[0]?.ownerUserId ?? null;
}

/**
 * Reclamo idempotente del event-administrator (decisión §37): lo escribe la primera autenticación de
 * cuenta que llega desde una sesión de ese evento.
 *
 * La condición `admin_user_id IS NULL` es todo el mecanismo: dos reclamos concurrentes intentan escribir
 * y solo uno lo consigue. El que pierde **no** es un error, es el hecho de que el evento ya tenía
 * administrador, y por eso la función devuelve `false` en vez de lanzar.
 */
export async function claimEventAdmin(
  database: Queryable,
  input: { readonly eventId: string; readonly userId: string },
): Promise<boolean> {
  const { rowCount } = await database.query(
    `UPDATE app.event
        SET admin_user_id = $2
      WHERE id = $1
        AND admin_user_id IS NULL`,
    [input.eventId, input.userId],
  );

  return rowCount === 1;
}

/** El administrador reclamado con el nombre que el panel pinta; los nulos son la ausencia del hecho. */
export type EventAdministratorRecord = {
  readonly adminUserId: string | null;
  readonly displayName: string | null;
  readonly isAdmin: boolean | null;
};

/**
 * Una sola lectura que resuelve el derecho (`adminUserId`) y el nombre del panel.
 *
 * `null` es «el evento no existe»; `adminUserId` nulo es «sin reclamar». El borde decide con esta fila
 * antes de responder, así que el cliente no necesita una segunda petición para saber si entra.
 */
export async function readEventAdministrator(
  database: Queryable,
  eventId: string,
): Promise<EventAdministratorRecord | null> {
  const { rows } = await database.query<EventAdministratorRecord>(
    `SELECT e.admin_user_id AS "adminUserId",
            u.display_name AS "displayName",
            u.is_admin AS "isAdmin"
       FROM app.event e
       LEFT JOIN app."user" u ON u.id = e.admin_user_id
      WHERE e.id = $1`,
    [eventId],
  );

  return rows[0] ?? null;
}

/** El WhatsApp del evento tal como se guarda: solo dígitos, o `null` cuando no se configuró. */
export type EventContactRecord = {
  readonly contactPhone: string | null;
};

/**
 * El WhatsApp **del vendedor** para el evento (ciclo 4e). `null` es «el evento no existe»;
 * `contactPhone` nulo es «sin configurar», que es lo que deshabilita el botón del carrito.
 *
 * La columna no es un dato del visitante y no relaja la regla sobre nombre, correo o dirección: el
 * comprador solo la recibe compuesta en el enlace de WhatsApp de su solicitud (decisión §44).
 */
export async function readEventContact(
  database: Queryable,
  eventId: string,
): Promise<EventContactRecord | null> {
  const { rows } = await database.query<EventContactRecord>(
    `SELECT contact_phone AS "contactPhone"
       FROM app.event
      WHERE id = $1`,
    [eventId],
  );

  return rows[0] ?? null;
}

/**
 * Escribe el WhatsApp del evento y devuelve lo guardado. `null` lo quita: el acto es idempotente y no
 * toca nada más del evento. El valor llega ya normalizado por `parseContactPhone`, que es la única
 * regla de forma (`shared`).
 */
export async function updateEventContact(
  database: Queryable,
  input: { readonly eventId: string; readonly contactPhone: string | null },
): Promise<EventContactRecord | null> {
  const { rows } = await database.query<EventContactRecord>(
    `UPDATE app.event
        SET contact_phone = $2
      WHERE id = $1
      RETURNING contact_phone AS "contactPhone"`,
    [input.eventId, input.contactPhone],
  );

  return rows[0] ?? null;
}

export async function listEventsForUser(
  database: Queryable,
  userId: string,
): Promise<EventMembershipRecord[]> {
  const { rows } = await database.query<EventMembershipRecord>(
    `SELECT e.id,
            e.public_slug AS "publicSlug",
            e.admin_user_id AS "adminUserId",
            e.origin_city AS "originCity",
            e.destination_city AS "destinationCity",
            e.currency,
            e.state,
            m.role
     FROM app.event_member m
     JOIN app.event e ON e.id = m.event_id
     WHERE m.user_id = $1
     ORDER BY e.created_at`,
    [userId],
  );

  return rows;
}

export async function findEventForUser(
  database: Queryable,
  eventId: string,
  userId: string,
): Promise<EventMembershipRecord | null> {
  const { rows } = await database.query<EventMembershipRecord>(
    `SELECT e.id,
            e.public_slug AS "publicSlug",
            e.admin_user_id AS "adminUserId",
            e.origin_city AS "originCity",
            e.destination_city AS "destinationCity",
            e.currency,
            e.state,
            m.role
     FROM app.event_member m
     JOIN app.event e ON e.id = m.event_id
     WHERE m.user_id = $1 AND e.id = $2`,
    [userId, eventId],
  );

  return rows[0] ?? null;
}

/**
 * Un evento tal como lo lee la administración de plataforma (ciclo E1).
 *
 * `createdAt` es la primera mitad del cursor y `administratorName` es `null` mientras nadie reclama
 * el evento: la lectura publica el hecho, no lo inventa.
 */
export type PlatformEventRecord = EventRecord & {
  readonly createdAt: Date;
  readonly administratorName: string | null;
};

/**
 * Página de eventos para `ADMIN_TOKEN`, ordenada de la más reciente a la más antigua.
 *
 * La paginación es por llave y no por `OFFSET`: el cursor es el último renglón publicado, así que una
 * alta entre dos páginas no desplaza lo que el lector ya vio. El `LEFT JOIN` trae el nombre del
 * administrador reclamado sin convertir la ausencia en un error.
 *
 * `limit` llega **ya incrementado** por la ruta cuando quiere saber si hay página siguiente; esta
 * función devuelve lo que la base entregue y no recorta.
 */
export async function listEventsForPlatform(
  database: Queryable,
  input: {
    readonly limit: number;
    readonly before: { readonly createdAt: Date; readonly id: string } | null;
  },
): Promise<PlatformEventRecord[]> {
  const { rows } = await database.query<PlatformEventRecord>(
    `SELECT e.id,
            e.public_slug AS "publicSlug",
            e.admin_user_id AS "adminUserId",
            e.origin_city AS "originCity",
            e.destination_city AS "destinationCity",
            e.currency,
            e.state,
            e.created_at AS "createdAt",
            u.display_name AS "administratorName"
       FROM app.event e
       LEFT JOIN app."user" u ON u.id = e.admin_user_id
      WHERE $1::timestamptz IS NULL
         OR (e.created_at, e.id) < ($1::timestamptz, $2::uuid)
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT $3`,
    [input.before?.createdAt ?? null, input.before?.id ?? null, input.limit],
  );

  return rows;
}

/**
 * Inserta una invitación con su etiqueta. Es la escritura, no la política: la palabra la elige
 * `issueInvitation`, que es quien conoce el anillo y la transacción.
 *
 * `label` es opcional para que el SQL de base se pueda probar sin la secuencia; una fila sin etiqueta
 * es válida por el esquema y el panel la muestra como «Sin etiqueta».
 */
export async function createInvitation(
  database: Queryable,
  input: {
    readonly eventId: string;
    readonly tokenHash: string;
    readonly createdBy: string;
    readonly expiresAt: Date;
    readonly label?: string | null;
  },
): Promise<{ readonly id: string; readonly expiresAt: Date }> {
  const { rows } = await database.query<{ id: string; expiresAt: Date }>(
    `INSERT INTO app.invitation (event_id, token_hash, created_by, expires_at, label)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, expires_at AS "expiresAt"`,
    [input.eventId, input.tokenHash, input.createdBy, input.expiresAt, input.label ?? null],
  );

  const invitation = rows[0];
  if (invitation === undefined) {
    throw new Error('invitation-insert-returned-no-row');
  }

  return invitation;
}

/** La fila única del anillo existe siempre antes de bloquearla, también en una base recién migrada. */
async function ensureInvitationSequence(database: Queryable): Promise<void> {
  await database.query(
    `INSERT INTO app.invitation_label_sequence (id) VALUES (true) ON CONFLICT (id) DO NOTHING`,
  );
}

/**
 * Bloquea y devuelve la última palabra emitida en el sistema.
 *
 * El `FOR UPDATE` es el candado de la emisión: dos emisiones simultáneas —de dos eventos distintos o
 * de dos instancias del servicio— hacen cola aquí y no pueden leer el mismo puntero. Un `null` es el
 * estado inicial: el anillo empieza en `caja`.
 */
async function lockInvitationSequence(database: Queryable): Promise<string | null> {
  const { rows } = await database.query<{ lastLabel: string | null }>(
    `SELECT last_label AS "lastLabel" FROM app.invitation_label_sequence WHERE id FOR UPDATE`,
  );

  return rows[0]?.lastLabel ?? null;
}

async function advanceInvitationSequence(
  database: Queryable,
  label: string,
  now: Date,
): Promise<void> {
  await database.query(
    `UPDATE app.invitation_label_sequence SET last_label = $1, advanced_at = $2 WHERE id`,
    [label, now],
  );
}

/**
 * Emite una invitación con la siguiente palabra del anillo (corte 4c-fix, decisión §42).
 *
 * Es la **única** ruta de emisión: asegura la fila del puntero, la bloquea, elige la palabra y escribe
 * la invitación y el avance en la misma transacción. El puntero vive en la base y no en el proceso, así
 * que un reinicio o un `Redeploy` no lo devuelve a `caja`: la siguiente emisión continúa el anillo.
 */
export async function issueInvitation(
  database: Database,
  input: {
    readonly eventId: string;
    readonly tokenHash: string;
    readonly createdBy: string;
    readonly now: Date;
    readonly expiresAt: Date;
  },
): Promise<{ readonly id: string; readonly label: string; readonly expiresAt: Date }> {
  return database.transaction(async (client) => {
    await ensureInvitationSequence(client);
    const last = await lockInvitationSequence(client);
    const label = nextInvitationLabel(last);

    const invitation = await createInvitation(client, {
      eventId: input.eventId,
      tokenHash: input.tokenHash,
      createdBy: input.createdBy,
      expiresAt: input.expiresAt,
      label,
    });

    await advanceInvitationSequence(client, label, input.now);

    return { id: invitation.id, label, expiresAt: invitation.expiresAt };
  });
}

/** Bloquea la fila durante el canje: dos dispositivos con el mismo enlace no pueden consumirlo. */
export async function findInvitationForUpdate(
  database: Queryable,
  tokenHash: string,
): Promise<InvitationRecord | null> {
  const { rows } = await database.query<InvitationRecord>(
    `SELECT id,
            event_id AS "eventId",
            created_by AS "createdBy",
            expires_at AS "expiresAt",
            use_count AS "useCount",
            consumed_at AS "consumedAt",
            claimed_at AS "claimedAt",
            revoked_at AS "revokedAt"
     FROM app.invitation
     WHERE token_hash = $1
     FOR UPDATE`,
    [tokenHash],
  );

  return rows[0] ?? null;
}

/**
 * Canje atómico: suma un uso y, en el primero, marca `consumed_at` y `consumed_by`. La condición
 * repite el veredicto del núcleo con el reloj del servidor, así que un canje que perdió la carrera
 * —o que llegó después de una revocación o de un reclamo— no escribe nada.
 */
export async function increaseInvitationUse(
  database: Queryable,
  input: {
    readonly invitationId: string;
    readonly maxUses: number;
    readonly now: Date;
    readonly userId: string | null;
  },
): Promise<boolean> {
  const { rowCount } = await database.query(
    `UPDATE app.invitation
        SET use_count = use_count + 1,
            consumed_at = COALESCE(consumed_at, $3),
            consumed_by = COALESCE(consumed_by, $4)
      WHERE id = $1
        AND use_count < $2
        AND revoked_at IS NULL
        AND claimed_at IS NULL
        AND expires_at > $3`,
    [input.invitationId, input.maxUses, input.now, input.userId],
  );

  return rowCount === 1;
}

export async function findFactor(
  database: Queryable,
  issuer: string,
  subject: string,
): Promise<FactorRecord | null> {
  const { rows } = await database.query<UserRecord & { readonly factorId: string }>(
    `SELECT f.id AS "factorId",
            u.id,
            u.display_name AS "displayName",
            u.is_admin AS "isAdmin"
     FROM app.auth_factor f
     JOIN app."user" u ON u.id = f.user_id
     WHERE f.issuer = $1 AND f.subject = $2`,
    [issuer, subject],
  );

  const row = rows[0];
  if (row === undefined) {
    return null;
  }

  return {
    factorId: row.factorId,
    user: { id: row.id, displayName: row.displayName, isAdmin: row.isAdmin },
  };
}

export async function createUser(database: Queryable, displayName: string): Promise<UserRecord> {
  const { rows } = await database.query<UserRecord>(
    `INSERT INTO app."user" (display_name)
     VALUES ($1)
     RETURNING ${USER_COLUMNS}`,
    [displayName],
  );

  const user = rows[0];
  if (user === undefined) {
    throw new Error('user-insert-returned-no-row');
  }

  return user;
}

/**
 * Nombre visible de una cuenta (ciclo 4d, `shop-account`).
 *
 * El sujeto lo pone la sesión que el middleware resolvió, nunca el cuerpo de la petición: el acto solo
 * alcanza la propia fila. Devuelve `null` si la fila no existe, que el borde trata como una sesión que
 * ya no sirve en vez de inventar un usuario.
 */
export async function updateUserDisplayName(
  database: Queryable,
  input: { readonly userId: string; readonly displayName: string },
): Promise<UserRecord | null> {
  const { rows } = await database.query<UserRecord>(
    `UPDATE app."user"
     SET display_name = $2
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [input.userId, input.displayName],
  );

  return rows[0] ?? null;
}

export async function createFactor(
  database: Queryable,
  input: { readonly userId: string; readonly issuer: string; readonly subject: string },
): Promise<string> {
  const { rows } = await database.query<{ id: string }>(
    `INSERT INTO app.auth_factor (user_id, kind, issuer, subject)
     VALUES ($1, 'oauth', $2, $3)
     RETURNING id`,
    [input.userId, input.issuer, input.subject],
  );

  const factor = rows[0];
  if (factor === undefined) {
    throw new Error('factor-insert-returned-no-row');
  }

  return factor.id;
}

export async function touchFactor(database: Queryable, factorId: string): Promise<void> {
  await database.query('UPDATE app.auth_factor SET last_used_at = now() WHERE id = $1', [factorId]);
}

export async function addEventMember(
  database: Queryable,
  input: {
    readonly eventId: string;
    readonly userId: string;
    readonly role: EventRole;
    readonly invitedBy: string | null;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO app.event_member (event_id, user_id, role, invited_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [input.eventId, input.userId, input.role, input.invitedBy],
  );
}

export async function createSession(
  database: Queryable,
  input: {
    readonly userId: string | null;
    readonly eventId: string | null;
    readonly tokenHash: string;
    readonly scope: SessionScope;
    readonly deviceLabel: string | null;
  },
): Promise<string> {
  const { rows } = await database.query<{ id: string }>(
    `INSERT INTO app.session (user_id, event_id, token_hash, scope, device_label)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.userId, input.eventId, input.tokenHash, input.scope, input.deviceLabel],
  );

  const session = rows[0];
  if (session === undefined) {
    throw new Error('session-insert-returned-no-row');
  }

  return session.id;
}

export async function findSessionByTokenHash(
  database: Queryable,
  tokenHash: string,
): Promise<SessionRecord | null> {
  const { rows } = await database.query<{
    readonly id: string;
    readonly userId: string | null;
    readonly eventId: string | null;
    readonly scope: SessionScope;
    readonly revokedAt: Date | null;
    readonly displayName: string | null;
    readonly isAdmin: boolean | null;
  }>(
    `SELECT s.id,
            s.user_id AS "userId",
            s.event_id AS "eventId",
            s.scope,
            s.revoked_at AS "revokedAt",
            u.display_name AS "displayName",
            u.is_admin AS "isAdmin"
     FROM app.session s
     LEFT JOIN app."user" u ON u.id = s.user_id
     WHERE s.token_hash = $1`,
    [tokenHash],
  );

  const row = rows[0];
  if (row === undefined) {
    return null;
  }

  // La sesión de evento no tiene sujeto: `user` es `null`, no un usuario vacío.
  const user =
    row.userId === null || row.displayName === null
      ? null
      : { id: row.userId, displayName: row.displayName, isAdmin: row.isAdmin === true };

  return {
    id: row.id,
    userId: row.userId,
    eventId: row.eventId,
    scope: row.scope,
    revokedAt: row.revokedAt,
    user,
  };
}

export async function touchSession(database: Queryable, sessionId: string): Promise<void> {
  await database.query('UPDATE app.session SET last_seen_at = now() WHERE id = $1', [sessionId]);
}

export async function revokeSession(database: Queryable, sessionId: string): Promise<boolean> {
  const { rowCount } = await database.query(
    `UPDATE app.session
     SET revoked_at = now()
     WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId],
  );

  return rowCount === 1;
}

export async function listEventSessions(
  database: Queryable,
  eventId: string,
): Promise<EventSessionRecord[]> {
  const { rows } = await database.query<EventSessionRecord>(
    `SELECT s.id,
           s.user_id AS "userId",
           u.display_name AS "userDisplayName",
           s.scope,
           s.device_label AS "deviceLabel",
           s.created_at AS "createdAt",
           s.last_seen_at AS "lastSeenAt",
           s.revoked_at AS "revokedAt"
    FROM app.session s
    LEFT JOIN app."user" u ON u.id = s.user_id
    WHERE s.event_id = $1
       OR s.user_id IN (SELECT user_id FROM app.event_member WHERE event_id = $1)
    ORDER BY s.created_at DESC`,
    [eventId],
  );

  return rows;
}

/**
 * Los co-dispositivos del evento: sesiones **sin sujeto** y de ese evento.
 *
 * No reusa `listEventSessions` a propósito: aquella sirve a `/admin/*` y trae también las sesiones
 * de cuenta de los miembros; en el panel eso ofrecería la propia sesión del rey y permitiría retirar una
 * cuenta, que es un acto de membresía que este corte no declara. El filtro **es** la regla.
 *
 * Las sesiones ya revocadas siguen apareciendo con su `revokedAt`: ese estado es la evidencia del acto,
 * no basura que se esconde.
 */
export async function listEventCoDeviceSessions(
  database: Queryable,
  eventId: string,
): Promise<EventSessionRecord[]> {
  const { rows } = await database.query<EventSessionRecord>(
    `SELECT s.id,
            s.user_id AS "userId",
            u.display_name AS "userDisplayName",
            s.scope,
            s.device_label AS "deviceLabel",
            s.created_at AS "createdAt",
            s.last_seen_at AS "lastSeenAt",
            s.revoked_at AS "revokedAt"
       FROM app.session s
       LEFT JOIN app."user" u ON u.id = s.user_id
      WHERE s.event_id = $1
        AND s.user_id IS NULL
      ORDER BY s.created_at DESC`,
    [eventId],
  );

  return rows;
}

/**
 * Los enlaces que el evento emitió, del más reciente al más antiguo (ciclo 4c-3).
 *
 * Se listan **todos**, incluidos los cancelados y los agotados: su estado es la evidencia de que el
 * enlace existió y de lo que se hizo con él, no basura que se esconde. El filtro por evento es la
 * regla: una invitación de otro evento no se publica en este panel.
 */
export async function listEventInvitations(
  database: Queryable,
  eventId: string,
): Promise<EventInvitationRecord[]> {
  const { rows } = await database.query<EventInvitationRecord>(
    `SELECT id,
            created_at AS "createdAt",
            expires_at AS "expiresAt",
            use_count AS "useCount",
            revoked_at AS "revokedAt",
            label
       FROM app.invitation
      WHERE event_id = $1
      ORDER BY created_at DESC`,
    [eventId],
  );

  return rows;
}

/** La fila mínima de una sesión para decidir un acto antes de escribirlo. */
export type SessionSubjectRecord = {
  readonly id: string;
  readonly userId: string | null;
  readonly eventId: string | null;
  readonly revokedAt: Date | null;
};

/**
 * Una sesión por su identificador.
 *
 * `revokeSession` revoca por id sin mirar a quién pertenece, y esa ceguera es correcta para la
 * superficie de `ADMIN_TOKEN`. Desde el evento no sirve: el acto tiene alcance de un evento y de un tipo
 * de sesión, así que el borde lee esta fila y decide con ella.
 */
export async function findSessionById(
  database: Queryable,
  sessionId: string,
): Promise<SessionSubjectRecord | null> {
  const { rows } = await database.query<SessionSubjectRecord>(
    `SELECT id,
            user_id AS "userId",
            event_id AS "eventId",
            revoked_at AS "revokedAt"
       FROM app.session
      WHERE id = $1`,
    [sessionId],
  );

  return rows[0] ?? null;
}

/**
 * Retira el acceso de un co-dispositivo del evento.
 *
 * La condición repite el hecho —esa sesión, de ese evento, sin sujeto— para que la sentencia no pueda
 * tocar nada más. `COALESCE` la hace idempotente y conserva el primer instante de la revocación como
 * evidencia; un segundo acto responde igual y no reescribe la fecha.
 */
export async function revokeEventCoDeviceSession(
  database: Queryable,
  input: { readonly eventId: string; readonly sessionId: string },
): Promise<boolean> {
  const { rowCount } = await database.query(
    `UPDATE app.session
        SET revoked_at = COALESCE(revoked_at, now())
      WHERE id = $2
        AND event_id = $1
        AND user_id IS NULL`,
    [input.eventId, input.sessionId],
  );

  return rowCount === 1;
}

/**
 * Cancela un enlace del evento (ciclo 4c-3).
 *
 * La condición repite el hecho —esa invitación y ese evento— para que el acto no alcance a otro
 * evento; `COALESCE` lo hace idempotente y conserva el primer instante de la cancelación, que es su
 * evidencia. `invitationUsability` ya devuelve `revoked` primero e `increaseInvitationUse` exige
 * `revoked_at IS NULL`, así que el canje responde `invitation_invalid` sin tocar el núcleo.
 *
 * `now` viaja como argumento porque el instante lo posee el borde, no la base (`03` §3).
 */
export async function cancelInvitation(
  database: Queryable,
  input: { readonly eventId: string; readonly invitationId: string; readonly now: Date },
): Promise<boolean> {
  const { rowCount } = await database.query(
    `UPDATE app.invitation
        SET revoked_at = COALESCE(revoked_at, $3)
      WHERE id = $1
        AND event_id = $2`,
    [input.invitationId, input.eventId, input.now],
  );

  return rowCount === 1;
}
