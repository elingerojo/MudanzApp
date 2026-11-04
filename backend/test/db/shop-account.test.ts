import { randomUUID } from 'node:crypto';

import { createDatabase } from '../../src/db.js';
import {
  createFactor,
  createSession,
  createUser,
  findFactor,
  findSessionByTokenHash,
  touchFactor,
  updateUserDisplayName,
} from '../../src/store/identity-store.js';
import { hashToken } from '../../src/tokens.js';

/**
 * La cuenta de la tienda sobre la base real (ciclo 4d, `shop-account`).
 *
 * Hechos que solo el SQL demuestra:
 * 1. el primer acceso crea la cuenta y su factor, y emite una sesión `shop` con sujeto y sin evento;
 * 2. el segundo acceso reusa el mismo factor y no duplica la cuenta;
 * 3. el nombre visible escribe **solo** la fila del usuario indicado.
 *
 * El `issuer` y el `subject` son propios de esta suite: el verificador `fake` del arnés fija un solo
 * sujeto, así que el e2e no puede demostrar el alta. Solo entra con `test:api:db`/`:branch`.
 */
const database = createDatabase(process.env.DATABASE_URL ?? null);

afterAll(async () => {
  await database.close();
});

describe('shop account', () => {
  it('registers the first access and reuses the same factor afterwards', async () => {
    const issuer = 'https://shop-account-test.local';
    const subject = `subject-${randomUUID()}`;

    // Primer acceso: el factor no existe, así que el borde crea usuario y factor.
    expect(await findFactor(database, issuer, subject)).toBeNull();

    const user = await createUser(database, 'Comprador de prueba');
    const factorId = await createFactor(database, { userId: user.id, issuer, subject });

    const firstToken = `shop-first-${randomUUID()}`;
    await createSession(database, {
      userId: user.id,
      eventId: null,
      tokenHash: hashToken(firstToken),
      scope: 'shop',
      deviceLabel: 'Navegador de prueba',
    });

    const factor = await findFactor(database, issuer, subject);
    expect(factor).not.toBeNull();
    if (factor === null) {
      return;
    }

    expect(factor).toMatchObject({
      factorId,
      user: { id: user.id, displayName: 'Comprador de prueba' },
    });

    const firstSession = await findSessionByTokenHash(database, hashToken(firstToken));
    expect(firstSession).toMatchObject({
      userId: user.id,
      eventId: null,
      scope: 'shop',
      revokedAt: null,
    });

    // Segundo acceso: el mismo factor, una sesión nueva y ninguna cuenta nueva.
    const secondToken = `shop-second-${randomUUID()}`;
    await touchFactor(database, factorId);
    await createSession(database, {
      userId: factor.user.id,
      eventId: null,
      tokenHash: hashToken(secondToken),
      scope: 'shop',
      deviceLabel: 'Otro navegador',
    });

    const secondSession = await findSessionByTokenHash(database, hashToken(secondToken));
    expect(secondSession).toMatchObject({
      userId: user.id,
      eventId: null,
      scope: 'shop',
    });
    expect(secondSession?.id).not.toBe(firstSession?.id);
  });

  it('updates only the profile row of the indicated user', async () => {
    const first = await createUser(database, 'Primera cuenta de tienda');
    const second = await createUser(database, 'Segunda cuenta de tienda');

    const updated = await updateUserDisplayName(database, {
      userId: first.id,
      displayName: '  Compradora  ',
    });

    // El esquema del borde recorta; el store escribe lo que recibe. Aquí se comprueba el alcance.
    expect(updated).toMatchObject({ id: first.id, displayName: '  Compradora  ' });

    const { rows } = await database.query<{ readonly displayName: string }>(
      `SELECT display_name AS "displayName" FROM app."user" WHERE id = $1`,
      [second.id],
    );
    expect(rows[0]?.displayName).toBe('Segunda cuenta de tienda');

    const missing = await updateUserDisplayName(database, {
      userId: '00000000-0000-4000-8000-000000000000',
      displayName: 'Nadie',
    });
    expect(missing).toBeNull();
  });
});
