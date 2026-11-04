import type { Database } from '../../src/db.js';
import { hashToken } from '../../src/tokens.js';

/**
 * Doble de `Database` para la frontera de la cuenta de tienda (ciclo 4d).
 *
 * Responde por **forma** de la sentencia: el token de la sesión, el `touch`, la lectura del factor, el
 * alta del usuario y su factor, el `touch` del factor, la inserción de la sesión y la escritura del
 * nombre. Cualquier otra consulta **falla** en vez de devolver una fila inventada: un doble que
 * responde a todo esconaría justo el defecto que la prueba busca.
 *
 * La base real se ejerce en `test/db/shop-account.test.ts`; aquí solo se demuestra qué responde el
 * borde a cada veredicto y qué valores llegan a la inserción de la sesión.
 */

export interface ShopSessionFixture {
  readonly token: string;
  readonly id: string;
  readonly userId: string | null;
  readonly displayName: string | null;
  readonly isAdmin: boolean;
  readonly scope: 'app' | 'shop';
  readonly revokedAt: Date | null;
}

export interface ShopFactorFixture {
  readonly factorId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly isAdmin: boolean;
}

export interface ShopAccountFixture {
  readonly sessions: readonly ShopSessionFixture[];
  /** El factor que `findFactor` encuentra; `null` es el primer acceso del visitante. */
  readonly factor: ShopFactorFixture | null;
}

/** Lo que la ruta insertó en `app.session`, para afirmar alcance, sujeto y evento. */
export interface ShopSessionInsert {
  readonly userId: unknown;
  readonly eventId: unknown;
  readonly scope: unknown;
  readonly deviceLabel: unknown;
}

export interface ShopDatabaseHarness {
  readonly database: Database;
  readonly sessions: ShopSessionInsert[];
  /** Cuántas veces se creó un usuario: distingue el alta del regreso. */
  userInserts: number;
}

function rows<Row>(entries: readonly Row[], rowCount = entries.length) {
  return Promise.resolve({ rows: entries, rowCount, command: 'SELECT', oid: 0, fields: [] });
}

function none() {
  return rows([]);
}

export function shopAccountDatabase(fixture: ShopAccountFixture): ShopDatabaseHarness {
  /** El nombre vigente de cada usuario: el `PATCH` lo cambia y la lectura siguiente lo refleja. */
  const names = new Map<string, string | null>();
  for (const session of fixture.sessions) {
    if (session.userId !== null) {
      names.set(session.userId, session.displayName);
    }
  }

  if (fixture.factor !== null) {
    names.set(fixture.factor.userId, fixture.factor.displayName);
  }

  const sessions: ShopSessionInsert[] = [];
  const harness = { sessions, userInserts: 0 };

  const database = {
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
                eventId: null,
                scope: found.scope,
                revokedAt: found.revokedAt,
                displayName: found.userId === null ? null : (names.get(found.userId) ?? null),
                isAdmin: found.userId === null ? null : found.isAdmin,
              },
            ]);
      }

      if (text.includes('SET last_seen_at')) {
        return rows([], 1);
      }

      if (text.includes('FROM app.auth_factor f')) {
        if (fixture.factor === null) {
          return none();
        }

        return rows([
          {
            factorId: fixture.factor.factorId,
            id: fixture.factor.userId,
            displayName: fixture.factor.displayName,
            isAdmin: fixture.factor.isAdmin,
          },
        ]);
      }

      if (text.includes('INSERT INTO app."user"')) {
        harness.userInserts += 1;
        const displayName = value(0);
        names.set('user-new', displayName);
        return rows([{ id: 'user-new', displayName, isAdmin: false }]);
      }

      if (text.includes('INSERT INTO app.auth_factor')) {
        return rows([{ id: 'factor-new' }]);
      }

      if (text.includes('UPDATE app.auth_factor SET last_used_at')) {
        return rows([], 1);
      }

      if (text.includes('INSERT INTO app.session')) {
        sessions.push({
          userId: values?.[0],
          eventId: values?.[1],
          scope: values?.[3],
          deviceLabel: values?.[4],
        });
        return rows([{ id: 'session-new' }]);
      }

      if (text.includes('SET display_name = $2')) {
        const userId = value(0);
        const displayName = value(1);
        names.set(userId, displayName);
        return rows([{ id: userId, displayName, isAdmin: false }]);
      }

      return Promise.reject(new Error(`unexpected-query: ${text}`));
    },
    transaction: (work: (client: unknown) => Promise<unknown>) => Promise.resolve(work(database)),
    close: () => Promise.resolve(),
  } as unknown as Database;

  return {
    database,
    sessions,
    get userInserts() {
      return harness.userInserts;
    },
  };
}
