import { bearerToken, constantTimeEquals, createOpaqueToken, hashToken } from '../src/tokens.js';

describe('opaque tokens', () => {
  it('emits a URL-safe token with enough entropy and never repeats', () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });

  it('hashes deterministically and does not leak the token', () => {
    const token = createOpaqueToken();
    const hash = hashToken(token);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
  });
});

describe('bearerToken', () => {
  it('extracts the token without distinguishing the scheme case', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer abc')).toBe('abc');
  });

  it('returns null for an absent or malformed header', () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer ')).toBeNull();
  });
});

describe('constantTimeEquals', () => {
  it('compares equal and different values of the same length', () => {
    expect(constantTimeEquals('secret', 'secret')).toBe(true);
    expect(constantTimeEquals('secret', 'secreT')).toBe(false);
  });

  it('rejects different lengths without throwing', () => {
    expect(constantTimeEquals('short', 'a-much-longer-value')).toBe(false);
  });
});
