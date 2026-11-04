import { INVITATION_LABELS } from '../../src/domain/invitation-label.js';
import {
  dashboardDatabase,
  EVENT_ID,
  type SessionFixture,
} from '../support/event-admin-fixture.js';
import { startTestApp } from '../support/test-app.js';

/**
 * La emisión de un enlace nombrado (corte 4c-fix, `plan-ciclo-4c-fix-etiqueta-enlaces` §5 y §7).
 *
 * El anillo contra la base real se ejerce en `test/db/invitation-label.test.ts`. Aquí se demuestra el
 * hecho de la frontera: el `201` publica la palabra que **el servidor** eligió a partir del puntero, y
 * el cliente no tiene nada que decidir.
 */
const KING = { id: 'user-king', displayName: 'Ana', isAdmin: false };

const kingSession: SessionFixture = {
  token: 'king-token',
  id: 'session-king',
  userId: KING.id,
  eventId: null,
  displayName: KING.displayName,
  isAdmin: false,
};

interface IssuedBody {
  readonly id: string;
  readonly token: string;
  readonly expiresAt: string;
  readonly maxUses: number;
  readonly label: string;
}

async function issue(lastLabel: string | null): Promise<{ status: number; body: IssuedBody }> {
  const app = await startTestApp('ok', '', {
    database: dashboardDatabase({
      sessions: [kingSession],
      administrator: KING,
      memberUserId: KING.id,
      lastLabel,
    }),
  });

  try {
    const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/invitations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kingSession.token}` },
    });

    return { status: response.status, body: (await response.json()) as IssuedBody };
  } finally {
    await app.close();
  }
}

describe('POST /events/:eventId/invitations', () => {
  it('answers 201 with the word that follows the pointer', async () => {
    const { status, body } = await issue('manta');

    expect(status).toBe(201);
    expect(body.label).toBe('soga');
    expect(INVITATION_LABELS).toContain(body.label);
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.maxUses).toBe(5);
  });

  it('starts the ring at the first word when there is no pointer', async () => {
    const { status, body } = await issue(null);

    expect(status).toBe(201);
    expect(body.label).toBe(INVITATION_LABELS[0]);
  });
});
