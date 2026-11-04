import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { createDatabase } from '../../src/db.js';
import { INVITATION_LABELS, nextInvitationLabel } from '../../src/domain/invitation-label.js';
import { createEvent, ensureAdminUser, issueInvitation } from '../../src/store/identity-store.js';
import { hashToken } from '../../src/tokens.js';

/**
 * El anillo de nombres de invitación sobre la base real (corte 4c-fix,
 * `plan-ciclo-4c-fix-etiqueta-enlaces` §7).
 *
 * Hechos que solo un test contra la base puede demostrar:
 * 1. veintiuna emisiones recorren las veinte palabras y la vigésima primera vuelve a la primera;
 * 2. dos eventos **comparten** el anillo: la emisión del segundo continúa la del primero;
 * 3. el puntero vive en la base y no en el proceso: una segunda conexión continúa donde quedó la
 *    primera, que es lo que ocurre tras un reinicio o un `Redeploy`;
 * 4. volver a correr la migración no reinicia el anillo.
 *
 * Solo entra con `test:api:db`/`:branch`. La base es un sandbox desechable, así que cada prueba
 * **coloca el puntero** en «no ha empezado» para no depender de corridas anteriores.
 */
const connectionString = process.env.DATABASE_URL ?? null;
const database = createDatabase(connectionString);

afterAll(async () => {
  await database.close();
});

async function resetRing(): Promise<void> {
  await database.query(
    `INSERT INTO app.invitation_label_sequence (id) VALUES (true) ON CONFLICT (id) DO NOTHING`,
  );
  await database.query(
    `UPDATE app.invitation_label_sequence SET last_label = NULL, advanced_at = NULL WHERE id`,
  );
}

async function owner(): Promise<string> {
  const admin = await ensureAdminUser(database);
  if (admin === null) {
    throw new Error('admin-missing');
  }

  return admin.id;
}

async function event(ownerUserId: string, destinationCity: string): Promise<string> {
  const created = await createEvent(database, {
    ownerUserId,
    originCity: 'Quito',
    destinationCity: `${destinationCity} ${randomUUID().slice(0, 8)}`,
    currency: 'MXN',
  });

  return created.id;
}

async function emit(target: typeof database, eventId: string, createdBy: string): Promise<string> {
  const now = new Date();
  const invitation = await issueInvitation(target, {
    eventId,
    tokenHash: hashToken(`label-ring-${randomUUID()}`),
    createdBy,
    now,
    expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1_000),
  });

  return invitation.label;
}

describe('invitation label ring', () => {
  it('walks the twenty words and wraps on the twenty-first emission', async () => {
    await resetRing();
    const adminId = await owner();
    const eventId = await event(adminId, 'Ciclo');

    const emitted: string[] = [];
    for (let index = 0; index < INVITATION_LABELS.length + 1; index += 1) {
      emitted.push(await emit(database, eventId, adminId));
    }

    expect(emitted.slice(0, INVITATION_LABELS.length)).toEqual([...INVITATION_LABELS]);
    expect(emitted[INVITATION_LABELS.length]).toBe(INVITATION_LABELS[0]);
  });

  it('shares the ring between events', async () => {
    await resetRing();
    const adminId = await owner();
    const first = await event(adminId, 'Comparte A');
    const second = await event(adminId, 'Comparte B');

    expect(await emit(database, first, adminId)).toBe('caja');
    expect(await emit(database, second, adminId)).toBe('flete');
  });

  it('continues the ring from a second connection, as after a redeploy', async () => {
    await resetRing();
    const adminId = await owner();
    const eventId = await event(adminId, 'Reinicio');

    expect(await emit(database, eventId, adminId)).toBe('caja');
    expect(await emit(database, eventId, adminId)).toBe('flete');

    const restarted = createDatabase(connectionString);
    try {
      expect(await emit(restarted, eventId, adminId)).toBe('manta');
    } finally {
      await restarted.close();
    }
  });

  it('does not rewind the ring when the migration runs again', async () => {
    await resetRing();
    const adminId = await owner();
    const eventId = await event(adminId, 'Migracion');

    expect(await emit(database, eventId, adminId)).toBe('caja');
    expect(await emit(database, eventId, adminId)).toBe('flete');

    const sql = await readFile(
      new URL('../../sql/012_invitation_label.sql', import.meta.url),
      'utf8',
    );
    await database.query(sql);

    expect(await emit(database, eventId, adminId)).toBe('manta');
  });

  it('keeps the pure ring and the stored pointer in agreement', async () => {
    await resetRing();
    const adminId = await owner();
    const eventId = await event(adminId, 'Acuerdo');

    expect(await emit(database, eventId, adminId)).toBe(nextInvitationLabel(null));

    const { rows } = await database.query<{ lastLabel: string | null }>(
      `SELECT last_label AS "lastLabel" FROM app.invitation_label_sequence WHERE id`,
    );
    expect(rows[0]?.lastLabel).toBe('caja');
  });
});
