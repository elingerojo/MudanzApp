import type { IssuedSession } from '@mudanzapp/shared';

import { OAuthError, type OAuthVerifier } from '../../src/identity/oauth.js';
import { startTestApp } from '../support/test-app.js';
import {
  shopAccountDatabase,
  type ShopAccountFixture,
  type ShopSessionFixture,
} from '../support/shop-account-fixture.js';

/**
 * La frontera de la cuenta de tienda (ciclo 4d, `shop-account`).
 *
 * Lo que se demuestra aquí es el alcance exacto: el alta y el regreso emiten una sesión `shop` con
 * sujeto y sin evento; una sesión de aplicación no abre las rutas de la tienda y una de tienda no abre
 * las del evento; y el nombre solo escribe la fila del sujeto que la sesión resolvió.
 *
 * La base real se ejerce en `test/db/shop-account.test.ts`; aquí el doble responde por forma de la
 * sentencia (`../support/shop-account-fixture.ts`).
 */

const SHOP_SESSION: ShopSessionFixture = {
  token: 'shop-token',
  id: 'session-shop',
  userId: 'user-shop',
  displayName: 'Invitado',
  isAdmin: false,
  scope: 'shop',
  revokedAt: null,
};

const APP_SESSION: ShopSessionFixture = {
  token: 'app-token',
  id: 'session-app',
  userId: 'user-app',
  displayName: 'Ana',
  isAdmin: false,
  scope: 'app',
  revokedAt: null,
};

const REVOKED_SHOP_SESSION: ShopSessionFixture = {
  ...SHOP_SESSION,
  token: 'revoked-shop-token',
  id: 'session-revoked',
  revokedAt: new Date('2026-11-04T10:00:00.000Z'),
};

const FACTOR = {
  factorId: 'factor-1',
  userId: 'user-shop',
  displayName: 'Compradora',
  isAdmin: false,
};

const JSON_HEADERS = { 'content-type': 'application/json' };

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function start(fixture: ShopAccountFixture, oauth?: OAuthVerifier) {
  const harness = shopAccountDatabase(fixture);
  const app = await startTestApp('ok', '', { database: harness.database, oauth });

  return { app, harness };
}

describe('POST /auth/shop/sessions', () => {
  it('registers a first access and emits a shop session without an event', async () => {
    const { app, harness } = await start({ sessions: [], factor: null });

    try {
      const response = await fetch(`${app.baseUrl}/auth/shop/sessions`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ oauthToken: 'fake-id-token', deviceLabel: 'Móvil' }),
      });

      expect(response.status).toBe(201);
      const payload = (await response.json()) as IssuedSession;
      expect(payload).toMatchObject({
        scope: 'shop',
        user: { id: 'user-new', displayName: 'Invitado', isAdmin: false },
        event: null,
      });
      expect(typeof payload.sessionToken).toBe('string');
      expect(harness.userInserts).toBe(1);
      expect(harness.sessions).toHaveLength(1);
      expect(harness.sessions[0]).toMatchObject({
        userId: 'user-new',
        eventId: null,
        scope: 'shop',
        deviceLabel: 'Móvil',
      });
    } finally {
      await app.close();
    }
  });

  it('reuses an existing factor instead of registering the account again', async () => {
    const { app, harness } = await start({ sessions: [], factor: FACTOR });

    try {
      const response = await fetch(`${app.baseUrl}/auth/shop/sessions`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ oauthToken: 'fake-id-token' }),
      });

      expect(response.status).toBe(201);
      const payload = (await response.json()) as IssuedSession;
      expect(payload.user).toMatchObject({ id: FACTOR.userId, displayName: FACTOR.displayName });
      expect(harness.userInserts).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('translates a rejected identity token', async () => {
    const rejecting: OAuthVerifier = {
      verify: () => Promise.reject(new OAuthError('oauth_invalid_token')),
    };
    const { app } = await start({ sessions: [], factor: null }, rejecting);

    try {
      const response = await fetch(`${app.baseUrl}/auth/shop/sessions`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ oauthToken: 'invalido' }),
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'oauth_invalid_token' });
    } finally {
      await app.close();
    }
  });
});

describe('GET /auth/shop/session', () => {
  it('serves the identity of a shop session', async () => {
    const { app } = await start({ sessions: [SHOP_SESSION], factor: null });

    try {
      const response = await fetch(`${app.baseUrl}/auth/shop/session`, {
        headers: bearer(SHOP_SESSION.token),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        user: { id: SHOP_SESSION.userId, displayName: 'Invitado', isAdmin: false },
        session: { id: SHOP_SESSION.id, scope: 'shop' },
      });
    } finally {
      await app.close();
    }
  });

  it('refuses an application session with unauthorized', async () => {
    const { app } = await start({ sessions: [APP_SESSION], factor: null });

    try {
      const response = await fetch(`${app.baseUrl}/auth/shop/session`, {
        headers: bearer(APP_SESSION.token),
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    } finally {
      await app.close();
    }
  });

  it('refuses a revoked shop session with session_revoked', async () => {
    const { app } = await start({ sessions: [REVOKED_SHOP_SESSION], factor: null });

    try {
      const response = await fetch(`${app.baseUrl}/auth/shop/session`, {
        headers: bearer(REVOKED_SHOP_SESSION.token),
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'session_revoked' });
    } finally {
      await app.close();
    }
  });

  it('does not open the application identity with a shop session', async () => {
    const { app } = await start({ sessions: [SHOP_SESSION], factor: null });

    try {
      const response = await fetch(`${app.baseUrl}/auth/session`, {
        headers: bearer(SHOP_SESSION.token),
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    } finally {
      await app.close();
    }
  });
});

describe('PATCH /auth/shop/profile', () => {
  it('writes the name of the session subject and the next read reflects it', async () => {
    const { app } = await start({ sessions: [SHOP_SESSION], factor: null });

    try {
      const patch = await fetch(`${app.baseUrl}/auth/shop/profile`, {
        method: 'PATCH',
        headers: { ...bearer(SHOP_SESSION.token), ...JSON_HEADERS },
        body: JSON.stringify({ displayName: '  Compradora  ' }),
      });

      expect(patch.status).toBe(200);
      await expect(patch.json()).resolves.toEqual({
        user: { id: 'user-shop', displayName: 'Compradora', isAdmin: false },
      });

      const read = await fetch(`${app.baseUrl}/auth/shop/session`, {
        headers: bearer(SHOP_SESSION.token),
      });

      await expect(read.json()).resolves.toMatchObject({
        user: { id: 'user-shop', displayName: 'Compradora' },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects an empty name before touching the database', async () => {
    const { app } = await start({ sessions: [SHOP_SESSION], factor: null });

    try {
      const response = await fetch(`${app.baseUrl}/auth/shop/profile`, {
        method: 'PATCH',
        headers: { ...bearer(SHOP_SESSION.token), ...JSON_HEADERS },
        body: JSON.stringify({ displayName: '   ' }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'validation_failed' });
    } finally {
      await app.close();
    }
  });

  it('refuses an application session and a missing credential', async () => {
    const { app } = await start({ sessions: [APP_SESSION], factor: null });

    try {
      const withAppToken = await fetch(`${app.baseUrl}/auth/shop/profile`, {
        method: 'PATCH',
        headers: { ...bearer(APP_SESSION.token), ...JSON_HEADERS },
        body: JSON.stringify({ displayName: 'Compradora' }),
      });
      expect(withAppToken.status).toBe(401);
      await expect(withAppToken.json()).resolves.toEqual({ error: 'unauthorized' });

      const anonymous = await fetch(`${app.baseUrl}/auth/shop/profile`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ displayName: 'Compradora' }),
      });
      expect(anonymous.status).toBe(401);
    } finally {
      await app.close();
    }
  });
});
