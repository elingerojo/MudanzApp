import { hashToken } from '../../src/tokens.js';
import type { Database } from '../../src/db.js';
import { startTestApp } from '../support/test-app.js';

/**
 * La frontera del nivel de onboarding (corte 3k, `plan-ciclo-3k` §4).
 *
 * Lo que se demuestra aquí es **el borde**: el cuerpo se valida contra el máximo de la tabla, el
 * alcance se pregunta antes del acto y la respuesta publica el **efectivo**, no el piso guardado.
 * La base real y el SQL se ejercen en `test/db/onboarding-level.test.ts`; aquí el doble responde por
 * forma de la sentencia.
 */
const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_EVENT_ID = '22222222-2222-4222-8222-222222222222';
const CO_TOKEN = 'co-token';
const ACCOUNT_TOKEN = 'account-token';

function rows<Row>(entries: Row[], rowCount = entries.length) {
  return Promise.resolve({ rows: entries, rowCount, command: 'SELECT', oid: 0, fields: [] });
}

function none() {
  return rows([]);
}

/**
 * Doble por forma de la sentencia. El piso guardado muta con el `UPDATE`, así que la prueba observa
 * la escritura y no un valor sembrado que fingiría el acto.
 */
function onboardingDatabase(fixture: {
  readonly publishedCount: number;
  readonly stored: number | null;
}): Database {
  let stored = fixture.stored;

  const eventRow = () => ({
    id: EVENT_ID,
    publicSlug: 'bogota-ciudad-de-mexico-3f9a2c',
    adminUserId: null,
    originCity: 'Bogotá',
    destinationCity: 'Ciudad de México',
    currency: 'MXN',
    state: 'open',
    onboardingLevel: stored,
    publishedCount: fixture.publishedCount,
    role: 'member' as const,
  });

  return {
    check: () => Promise.resolve('ok'),
    transaction: () => Promise.reject(new Error('test-database-transaction-not-stubbed')),
    close: () => Promise.resolve(),
    query: (text: string, values?: readonly unknown[]) => {
      const value = (index: number): string => String(values?.[index] ?? '');

      if (text.includes('s.token_hash = $1')) {
        if (value(0) === hashToken(CO_TOKEN)) {
          return rows([
            {
              id: 'session-co',
              userId: null,
              eventId: EVENT_ID,
              scope: 'app',
              revokedAt: null,
              displayName: null,
              isAdmin: null,
            },
          ]);
        }

        if (value(0) === hashToken(ACCOUNT_TOKEN)) {
          return rows([
            {
              id: 'session-account',
              userId: 'user-1',
              eventId: null,
              scope: 'app',
              revokedAt: null,
              displayName: 'Ana',
              isAdmin: false,
            },
          ]);
        }

        return none();
      }

      if (text.includes('UPDATE app.session SET last_seen_at')) {
        return rows([], 0);
      }

      if (text.includes('FROM app.event_member m')) {
        // La cuenta alcanza EVENT_ID y no OTHER_EVENT_ID; la sesión de evento no pasa por aquí.
        return value(1) === EVENT_ID ? rows([eventRow()]) : none();
      }

      if (text.includes('SET onboarding_level = $2')) {
        stored = Number(value(1));
        return rows([{ onboardingLevel: stored, publishedCount: fixture.publishedCount }]);
      }

      return Promise.reject(new Error(`test-database-query-not-stubbed: ${text}`));
    },
  } as unknown as Database;
}

async function start(fixture: { publishedCount: number; stored: number | null }) {
  return startTestApp('ok', '', { database: onboardingDatabase(fixture) });
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

describe('PATCH /events/:eventId/onboarding-level', () => {
  it('lets an event session raise the level and answers with the effective level', async () => {
    const app = await start({ publishedCount: 0, stored: null });

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/onboarding-level`, {
        method: 'PATCH',
        headers: { ...bearer(CO_TOKEN), 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 1 }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ level: 1 });
    } finally {
      await app.close();
    }
  });

  it('publishes the derived level even when the stored floor is lower', async () => {
    const app = await start({ publishedCount: 4, stored: null });

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/onboarding-level`, {
        method: 'PATCH',
        headers: { ...bearer(ACCOUNT_TOKEN), 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 0 }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ level: 1 });
    } finally {
      await app.close();
    }
  });

  it('rejects a level outside the table and an extra key with validation_failed', async () => {
    const app = await start({ publishedCount: 0, stored: null });

    try {
      const outOfRange = await fetch(`${app.baseUrl}/events/${EVENT_ID}/onboarding-level`, {
        method: 'PATCH',
        headers: { ...bearer(CO_TOKEN), 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 2 }),
      });
      expect(outOfRange.status).toBe(400);
      await expect(outOfRange.json()).resolves.toEqual({ error: 'validation_failed' });

      const extraKey = await fetch(`${app.baseUrl}/events/${EVENT_ID}/onboarding-level`, {
        method: 'PATCH',
        headers: { ...bearer(CO_TOKEN), 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 1, photos: 9 }),
      });
      expect(extraKey.status).toBe(400);
      await expect(extraKey.json()).resolves.toEqual({ error: 'validation_failed' });
    } finally {
      await app.close();
    }
  });

  it('does not distinguish an unreachable event from a missing one', async () => {
    const app = await start({ publishedCount: 0, stored: null });

    try {
      const response = await fetch(`${app.baseUrl}/events/${OTHER_EVENT_ID}/onboarding-level`, {
        method: 'PATCH',
        headers: { ...bearer(CO_TOKEN), 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 1 }),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'not_found' });
    } finally {
      await app.close();
    }
  });

  it('requires a session', async () => {
    const app = await start({ publishedCount: 0, stored: null });

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/onboarding-level`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 1 }),
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    } finally {
      await app.close();
    }
  });
});
