import type { Database } from '../../src/db.js';
import { hashToken } from '../../src/tokens.js';

/**
 * Doble de `Database` para la frontera del dashboard (ciclos 4c-2 y 4c-3).
 *
 * Responde por **forma** de la sentencia y no por orden de llamadas: el middleware de sesión, el
 * `touch`, la lectura del administrador, la membresía, la lista de co-dispositivos, la lectura de una
 * sesión por id, la revocación, la lista de invitaciones y la cancelación son las consultas que el
 * borde puede hacer. Cualquier otra **falla** en vez de devolver una fila inventada: un doble que
 * responde a todo esconde justo el defecto que la prueba busca.
 *
 * Es un doble, no la regla: la base real y el SQL se ejercen en `test/db/event-admin.test.ts` y
 * `test/db/event-access.test.ts`. Aquí solo se demuestra qué responde el borde a cada veredicto.
 */

export const EVENT_ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_EVENT_ID = '22222222-2222-4222-8222-222222222222';

/** La sesión que el middleware resuelve a partir del token de la petición. */
export interface SessionFixture {
  readonly token: string;
  readonly id: string;
  readonly userId: string | null;
  readonly eventId: string | null;
  readonly displayName: string | null;
  readonly isAdmin: boolean;
}

/** Una fila de co-dispositivo tal como la devuelve el listado real. */
export interface DeviceRow {
  readonly id: string;
  readonly deviceLabel: string | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date | null;
  readonly revokedAt: Date | null;
}

/** Una fila de invitación tal como la devuelve el listado real: sin el hash, que no sale de la base. */
export interface InvitationRow {
  readonly id: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly useCount: number;
  readonly revokedAt: Date | null;
}

/** La sesión que el acto encuentra al leer por identificador. */
export interface TargetSession {
  readonly id: string;
  readonly userId: string | null;
  readonly eventId: string | null;
}

export interface DashboardFixture {
  readonly sessions: readonly SessionFixture[];
  readonly administrator: {
    readonly id: string;
    readonly displayName: string;
    readonly isAdmin: boolean;
  } | null;
  /** `true` hace que la lectura del administrador no encuentre el evento. */
  readonly eventMissing?: boolean;
  /** El único sujeto que registra membresía; el resto no la tiene. */
  readonly memberUserId?: string | null;
  readonly eventId?: string;
  readonly devices?: readonly DeviceRow[];
  readonly invitations?: readonly InvitationRow[];
  readonly target?: TargetSession;
}

function rows<Row>(entries: readonly Row[], rowCount = entries.length) {
  return Promise.resolve({ rows: entries, rowCount, command: 'SELECT', oid: 0, fields: [] });
}

function none() {
  return rows([]);
}

export function dashboardDatabase(fixture: DashboardFixture): Database {
  const eventId = fixture.eventId ?? EVENT_ID;

  const membership = {
    id: eventId,
    publicSlug: 'bogota-ciudad-de-mexico-3f9a2c',
    adminUserId: fixture.administrator?.id ?? null,
    originCity: 'Bogotá',
    destinationCity: 'Ciudad de México',
    currency: 'MXN',
    state: 'open',
    role: 'member',
  };

  return {
    check: () => Promise.resolve('ok'),
    query: (text: string, values?: readonly unknown[]) => {
      const value = (index: number): string => String(values?.[index] ?? '');

      if (text.includes('token_hash = $1')) {
        const found = fixture.sessions.find((entry) => hashToken(entry.token) === value(0));
        return found === undefined
          ? none()
          : rows([
              {
                id: found.id,
                userId: found.userId,
                eventId: found.eventId,
                scope: 'app',
                revokedAt: null,
                displayName: found.displayName,
                isAdmin: found.isAdmin,
              },
            ]);
      }

      if (text.includes('SET last_seen_at')) {
        return rows([], 1);
      }

      if (text.includes('LEFT JOIN app."user" u ON u.id = e.admin_user_id')) {
        if (fixture.eventMissing === true) {
          return none();
        }

        return rows([
          {
            adminUserId: fixture.administrator?.id ?? null,
            displayName: fixture.administrator?.displayName ?? null,
            isAdmin: fixture.administrator?.isAdmin ?? null,
          },
        ]);
      }

      if (text.includes('FROM app.event_member m')) {
        const isMember =
          fixture.memberUserId !== undefined &&
          fixture.memberUserId !== null &&
          value(0) === fixture.memberUserId &&
          value(1) === eventId;

        return isMember ? rows([membership]) : none();
      }

      if (text.includes('AND s.user_id IS NULL')) {
        // El listado real selecciona `s.user_id`, nulo por definición: el presentador lo publica y el
        // contrato lo exige, así que el doble no puede omitirlo.
        return rows((fixture.devices ?? []).map((device) => ({ userId: null, ...device })));
      }

      if (text.includes('FROM app.invitation')) {
        return rows([...(fixture.invitations ?? [])]);
      }

      if (text.includes('UPDATE app.invitation')) {
        // La condición real es `id = $1 AND event_id = $2`: una fila de otro evento no se toca.
        const found = (fixture.invitations ?? []).some(
          (invitation) => invitation.id === value(0) && value(1) === eventId,
        );
        return rows([], found ? 1 : 0);
      }

      if (text.includes('COALESCE(revoked_at')) {
        return rows([], 1);
      }

      if (text.includes('FROM app.session') && text.includes('WHERE id = $1')) {
        const target = fixture.target;
        return target !== undefined && target.id === value(0)
          ? rows([{ ...target, revokedAt: null }])
          : none();
      }

      return Promise.reject(new Error(`unexpected-query: ${text}`));
    },
    transaction: () => Promise.reject(new Error('not-stubbed')),
    close: () => Promise.resolve(),
  } as unknown as Database;
}
