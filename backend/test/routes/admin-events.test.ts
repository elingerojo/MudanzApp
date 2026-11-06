import type { AdminEventPage } from '@mudanzapp/shared';
import { deriveEventPublicSlug } from '@mudanzapp/shared';
import type { QueryResult, QueryResultRow } from 'pg';

import type { Database } from '../../src/db.js';
import type { PlatformEventRecord } from '../../src/store/identity-store.js';
import { startTestApp } from '../support/test-app.js';

/**
 * La lista de plataforma del ciclo E1 (`plan-ciclo-e1-dashboard-plataforma` §7).
 *
 * La base se dobla en memoria: lo que se afirma es la frontera —el orden de los parámetros del
 * cursor, la fila de más que detecta la página siguiente y los tres códigos estables—, no el SQL de
 * Postgres, que ya se ejerce contra la base real en su propia corrida.
 */
const TOKEN = 'admin-token';

function event(
  overrides: Partial<PlatformEventRecord> & { readonly id: string },
): PlatformEventRecord {
  return {
    id: overrides.id,
    publicSlug: overrides.publicSlug ?? null,
    adminUserId: overrides.adminUserId ?? null,
    originCity: overrides.originCity ?? 'Bogotá',
    destinationCity: overrides.destinationCity ?? 'Ciudad de México',
    currency: overrides.currency ?? 'MXN',
    state: overrides.state ?? 'active',
    createdAt: overrides.createdAt ?? new Date('2026-11-01T10:00:00.000Z'),
    administratorName: overrides.administratorName ?? null,
  };
}

interface RecordedCall {
  readonly text: string;
  readonly values: readonly unknown[];
}

interface RecordingDatabase {
  readonly database: Database;
  readonly calls: RecordedCall[];
}

function recordingDatabase(rows: readonly PlatformEventRecord[]): RecordingDatabase {
  const calls: RecordedCall[] = [];

  const database: Database = {
    check: () => Promise.resolve('ok'),
    query: <Row extends QueryResultRow>(text: string, values?: readonly unknown[]) => {
      calls.push({ text, values: values ?? [] });
      const result: QueryResult<Row> = {
        command: 'SELECT',
        rowCount: rows.length,
        oid: 0,
        fields: [],
        rows: rows as unknown as Row[],
      };
      return Promise.resolve(result);
    },
    transaction: () => Promise.reject(new Error('transaction-not-stubbed')),
    close: () => Promise.resolve(),
  };

  return { database, calls };
}

interface Fetched {
  readonly status: number;
  readonly body: unknown;
  readonly calls: readonly RecordedCall[];
}

async function fetchEvents(
  query: string,
  input: {
    readonly rows?: readonly PlatformEventRecord[];
    readonly token?: string | null;
    readonly adminToken?: string | null;
  } = {},
): Promise<Fetched> {
  const { database, calls } = recordingDatabase(input.rows ?? []);
  const app = await startTestApp('ok', '', {
    database,
    adminToken: input.adminToken === undefined ? TOKEN : input.adminToken,
  });

  try {
    const token = input.token === undefined ? TOKEN : input.token;
    const response = await fetch(`${app.baseUrl}/admin/events${query}`, {
      headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    });

    return { status: response.status, body: await response.json(), calls };
  } finally {
    await app.close();
  }
}

describe('GET /admin/events', () => {
  it('answers admin_unauthorized without the platform credential', async () => {
    const { status, body, calls } = await fetchEvents('', { token: null });

    expect(status).toBe(401);
    expect(body).toEqual({ error: 'admin_unauthorized' });
    // Sin credencial no se consulta la base: la puerta se cierra antes de la lectura.
    expect(calls).toHaveLength(0);
  });

  it('answers admin_not_configured when the platform has no ADMIN_TOKEN', async () => {
    const { status, body } = await fetchEvents('', { adminToken: null });

    expect(status).toBe(503);
    expect(body).toEqual({ error: 'admin_not_configured' });
  });

  it('publishes the page, derives the slug and leaves an unclaimed event without a name', async () => {
    const id = '3f9a2c1e-8f3b-4a1e-9d4c-6b2f5a7c8d90';
    const { status, body, calls } = await fetchEvents('', {
      rows: [event({ id, createdAt: new Date('2026-11-02T09:00:00.000Z') })],
    });

    const page = body as AdminEventPage;
    expect(status).toBe(200);
    expect(page.events).toHaveLength(1);
    expect(page.events[0]?.publicSlug).toBe(
      deriveEventPublicSlug('Bogotá', 'Ciudad de México', id),
    );
    expect(page.events[0]?.createdAt).toBe('2026-11-02T09:00:00.000Z');
    expect(page.events[0]?.administratorName).toBeNull();
    expect(page.nextCursor).toBeNull();

    // La primera página no lleva cursor y pide una fila de más para saber si hay siguiente.
    expect(calls[0]?.values).toEqual([null, null, 21]);
  });

  it('publishes the administrator once the event is claimed', async () => {
    const { body } = await fetchEvents('', {
      rows: [event({ id: 'a1', adminUserId: 'user-king', administratorName: 'Ana' })],
    });

    expect((body as AdminEventPage).events[0]?.administratorName).toBe('Ana');
  });

  it('hands a cursor for the next page and accepts it back', async () => {
    const first = event({
      id: '11111111-1111-4111-8111-111111111111',
      createdAt: new Date('2026-11-03T12:00:00.000Z'),
    });
    const second = event({
      id: '22222222-2222-4222-8222-222222222222',
      createdAt: new Date('2026-11-02T12:00:00.000Z'),
    });

    const pageOne = await fetchEvents('?limit=1', { rows: [first, second] });
    const bodyOne = pageOne.body as AdminEventPage;

    expect(pageOne.status).toBe(200);
    expect(bodyOne.events).toHaveLength(1);
    expect(bodyOne.nextCursor).not.toBeNull();
    expect(pageOne.calls[0]?.values).toEqual([null, null, 2]);

    const pageTwo = await fetchEvents(`?limit=1&cursor=${String(bodyOne.nextCursor)}`, {
      rows: [second],
    });
    const bodyTwo = pageTwo.body as AdminEventPage;

    expect(pageTwo.status).toBe(200);
    expect(bodyTwo.events).toHaveLength(1);
    expect(bodyTwo.nextCursor).toBeNull();
    // El cursor viaja como parámetro: la primera mitad es el instante y la segunda el identificador.
    expect(pageTwo.calls[0]?.values[0]).toEqual(new Date('2026-11-03T12:00:00.000Z'));
    expect(pageTwo.calls[0]?.values[1]).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('rejects an unreadable cursor instead of guessing a page', async () => {
    const { status, body, calls } = await fetchEvents('?cursor=no-es-un-cursor');

    expect(status).toBe(400);
    expect(body).toEqual({ error: 'validation_failed' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a limit outside the contract', async () => {
    const zero = await fetchEvents('?limit=0');
    const tooMany = await fetchEvents('?limit=101');

    expect(zero.status).toBe(400);
    expect(tooMany.status).toBe(400);
  });
});
