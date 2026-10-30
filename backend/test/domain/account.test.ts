import {
  INVITATION_TTL_MS,
  invitationExpiry,
  invitationUsability,
  normalizeIssuer,
  sessionCoversScope,
  sessionUsability,
} from '../../src/domain/account.js';

/**
 * Núcleo puro de la regla de cuenta: la evidencia unitaria del ciclo 1 (`resumen-funcional` §2).
 * Sin base, sin HTTP y con el instante como argumento.
 */
const now = new Date('2026-10-30T12:00:00.000Z');
const oneSecondLater = new Date(now.getTime() + 1_000);
const oneSecondBefore = new Date(now.getTime() - 1_000);

describe('invitationUsability', () => {
  it('accepts an unconsumed, unrevoked invitation before its expiry', () => {
    const result = invitationUsability(
      { expiresAt: oneSecondLater, consumedAt: null, revokedAt: null },
      now,
    );

    expect(result).toEqual({ usable: true });
  });

  it('rejects an invitation exactly at its expiry instant', () => {
    const result = invitationUsability({ expiresAt: now, consumedAt: null, revokedAt: null }, now);

    expect(result).toEqual({ usable: false, reason: 'expired' });
  });

  it('reports a consumed invitation as consumed', () => {
    const result = invitationUsability(
      { expiresAt: oneSecondLater, consumedAt: oneSecondBefore, revokedAt: null },
      now,
    );

    expect(result).toEqual({ usable: false, reason: 'consumed' });
  });

  it('lets revocation win over consumption', () => {
    const result = invitationUsability(
      { expiresAt: oneSecondLater, consumedAt: oneSecondBefore, revokedAt: now },
      now,
    );

    expect(result).toEqual({ usable: false, reason: 'revoked' });
  });
});

describe('invitationExpiry', () => {
  it('issues a seven-day invitation from the given instant', () => {
    expect(invitationExpiry(now).getTime() - now.getTime()).toBe(INVITATION_TTL_MS);
    expect(INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1_000);
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

describe('sessionCoversScope', () => {
  it('requires the exact scope', () => {
    expect(sessionCoversScope('app', 'app')).toBe(true);
    expect(sessionCoversScope('app', 'shop')).toBe(false);
  });
});

describe('normalizeIssuer', () => {
  it('removes the trailing slash so one provider cannot create two accounts', () => {
    expect(normalizeIssuer(' https://id.example/ ')).toBe('https://id.example');
    expect(normalizeIssuer('https://id.example')).toBe('https://id.example');
  });
});
