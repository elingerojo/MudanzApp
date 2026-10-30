import {
  INVITATION_MAX_USES,
  INVITATION_TTL_MS,
  canActOnEvent,
  invitationExpiry,
  invitationUsability,
  normalizeIssuer,
  sessionCoversScope,
  sessionOwner,
  sessionUsability,
} from '../../src/domain/account.js';

/**
 * Núcleo puro de la regla de cuenta: la evidencia unitaria del ciclo 1 (`resumen-funcional` §2).
 * Sin base, sin HTTP y con el instante como argumento.
 */
const now = new Date('2026-10-30T12:00:00.000Z');
const oneSecondLater = new Date(now.getTime() + 1_000);

/** Invitación recién emitida: sin canjes, sin reclamo y sin revocación. */
const freshInvitation = {
  expiresAt: oneSecondLater,
  useCount: 0,
  claimedAt: null,
  revokedAt: null,
};

describe('invitationUsability', () => {
  it('accepts an unclaimed, unrevoked invitation before its expiry', () => {
    expect(invitationUsability(freshInvitation, now)).toEqual({ usable: true });
  });

  it('still accepts the invitation on its fifth and last redemption', () => {
    expect(
      invitationUsability({ ...freshInvitation, useCount: INVITATION_MAX_USES - 1 }, now),
    ).toEqual({ usable: true });
  });

  it('rejects the invitation once the five redemptions are spent', () => {
    expect(invitationUsability({ ...freshInvitation, useCount: INVITATION_MAX_USES }, now)).toEqual(
      {
        usable: false,
        reason: 'exhausted',
      },
    );
  });

  it('rejects an invitation exactly at its expiry instant', () => {
    expect(invitationUsability({ ...freshInvitation, expiresAt: now }, now)).toEqual({
      usable: false,
      reason: 'expired',
    });
  });

  it('reports a claimed invitation as claimed, for the rows the retired rule left behind', () => {
    expect(invitationUsability({ ...freshInvitation, useCount: 1, claimedAt: now }, now)).toEqual({
      usable: false,
      reason: 'claimed',
    });
  });

  it('lets revocation win over claim, exhaustion and time', () => {
    expect(
      invitationUsability(
        { expiresAt: now, useCount: INVITATION_MAX_USES, claimedAt: now, revokedAt: now },
        now,
      ),
    ).toEqual({ usable: false, reason: 'revoked' });
  });
});

describe('invitationExpiry', () => {
  it('issues a seventy-two-hour invitation from the given instant', () => {
    expect(invitationExpiry(now).getTime() - now.getTime()).toBe(INVITATION_TTL_MS);
    expect(INVITATION_TTL_MS).toBe(72 * 60 * 60 * 1_000);
  });

  it('admits five redemptions per invitation', () => {
    expect(INVITATION_MAX_USES).toBe(5);
  });
});

describe('sessionUsability', () => {
  it('accepts a session that was not revoked', () => {
    expect(sessionUsability({ revokedAt: null })).toEqual({ usable: true });
  });

  it('reports a revoked session and never lets it be reused', () => {
    expect(sessionUsability({ revokedAt: now })).toEqual({
      usable: false,
      reason: 'revoked',
    });
  });
});

describe('sessionOwner', () => {
  it('recognises an account session', () => {
    expect(sessionOwner({ userId: 'user-1', eventId: null })).toEqual({
      kind: 'account',
      userId: 'user-1',
    });
  });

  it('recognises an event session with no subject', () => {
    expect(sessionOwner({ userId: null, eventId: 'event-1' })).toEqual({
      kind: 'event',
      eventId: 'event-1',
    });
  });

  it('refuses a row with neither owner and a row with both', () => {
    expect(sessionOwner({ userId: null, eventId: null })).toBeNull();
    expect(sessionOwner({ userId: 'user-1', eventId: 'event-1' })).toBeNull();
  });
});

describe('sessionCoversScope', () => {
  it('requires the exact scope', () => {
    expect(sessionCoversScope('app', 'app')).toBe(true);
    expect(sessionCoversScope('app', 'shop')).toBe(false);
  });
});

describe('canActOnEvent', () => {
  it('lets an event session act on its own event', () => {
    expect(canActOnEvent({ eventId: 'event-1', userId: null }, 'event-1', false)).toBe(true);
  });

  it('refuses an event session on another event, even when a membership flag arrives', () => {
    expect(canActOnEvent({ eventId: 'event-1', userId: null }, 'event-2', true)).toBe(false);
  });

  it('lets an account session act where it is a member', () => {
    expect(canActOnEvent({ eventId: null, userId: 'user-1' }, 'event-2', true)).toBe(true);
  });

  it('refuses an account session where it is not a member', () => {
    expect(canActOnEvent({ eventId: null, userId: 'user-1' }, 'event-2', false)).toBe(false);
  });

  it('refuses an impossible session with neither an event nor a subject', () => {
    expect(canActOnEvent({ eventId: null, userId: null }, 'event-1', true)).toBe(false);
  });
});

describe('normalizeIssuer', () => {
  it('removes the trailing slash so one provider cannot create two accounts', () => {
    expect(normalizeIssuer(' https://id.example/ ')).toBe('https://id.example');
    expect(normalizeIssuer('https://id.example')).toBe('https://id.example');
  });
});
