import {
  createPendingFlowStore,
  discoverOAuth,
  exchangeAuthorizationCode,
  updateShopProfileSchema,
  type FetchInitLike,
  type FetchLike,
  type FetchResponseLike,
  type PendingFlowKeys,
  type PendingOAuthFlow,
  type StorageLike,
} from '@mudanzapp/shared';

/**
 * La mitad cliente del flujo OAuth compartida por `frontend` y `shop` (ciclos 4c-1 y 4d).
 *
 * El `fetch` entra por argumento, así que la prueba es determinista y no toca ninguna red. Se
 * demuestran los dos hechos que el corte de tienda necesita del ayudante: un documento de
 * descubrimiento válido se lee y uno inválido falla ruidoso, y el canje traduce **códigos** del borde
 * en vez de adivinar por el texto.
 */

function jsonResponse(body: unknown, ok = true, status = 200): FetchResponseLike {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  };
}

const DISCOVERY = {
  issuer: 'https://id.example',
  authorization_endpoint: 'https://id.example/authorize',
  token_endpoint: 'https://id.example/token',
};

const KEYS: PendingFlowKeys = {
  verifier: 'test.verifier',
  state: 'test.state',
  purpose: 'test.purpose',
};

function memoryStorage(): { readonly storage: StorageLike; readonly values: Map<string, string> } {
  const values = new Map<string, string>();

  return {
    values,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    },
  };
}

describe('discoverOAuth', () => {
  it('reads the two endpoints of a valid document', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = (url) => {
      calls.push(url);
      return Promise.resolve(jsonResponse(DISCOVERY));
    };

    const result = await discoverOAuth('https://id.example/', fetchImpl);

    expect(result).toEqual({ ok: true, value: DISCOVERY });
    expect(calls).toEqual(['https://id.example/.well-known/openid-configuration']);
  });

  it('treats an invalid document as unavailable instead of inventing an endpoint', async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(jsonResponse({ authorization_endpoint: 42 }));

    await expect(discoverOAuth('https://id.example', fetchImpl)).resolves.toEqual({
      ok: false,
      code: 'oauth_unavailable',
    });
  });

  it('treats a network failure as unavailable', async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new Error('offline'));

    await expect(discoverOAuth('https://id.example', fetchImpl)).resolves.toEqual({
      ok: false,
      code: 'oauth_unavailable',
    });
  });

  it('does not call the provider without an issuer', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = (url) => {
      calls.push(url);
      return Promise.resolve(jsonResponse(DISCOVERY));
    };

    await expect(discoverOAuth('   ', fetchImpl)).resolves.toEqual({
      ok: false,
      code: 'oauth_not_configured',
    });
    expect(calls).toHaveLength(0);
  });
});

describe('exchangeAuthorizationCode', () => {
  const input = {
    apiBaseUrl: '/api',
    code: 'codigo',
    codeVerifier: 'v'.repeat(43),
    redirectUri: 'http://localhost:4202/auth/callback',
  };

  it('sends code and verifier to the backend and returns the verified token', async () => {
    const calls: { readonly url: string; readonly init?: FetchInitLike }[] = [];
    const fetchImpl: FetchLike = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(jsonResponse({ oauthToken: 'id-token-verificado' }));
    };

    const result = await exchangeAuthorizationCode(input, fetchImpl);

    expect(result).toEqual({ ok: true, value: 'id-token-verificado' });
    expect(calls).toHaveLength(1);

    const exchange = calls[0];
    expect(exchange?.url).toBe('/api/auth/oauth/exchange');
    expect(exchange?.init?.method).toBe('POST');

    const body = JSON.parse(String(exchange?.init?.body)) as {
      readonly clientSecret?: string;
      readonly code?: string;
      readonly codeVerifier?: string;
      readonly redirectUri?: string;
    };
    expect(body.code).toBe('codigo');
    expect(body.codeVerifier).toBe('v'.repeat(43));
    expect(body.redirectUri).toBe(input.redirectUri);
    // El navegador no lleva el secreto: por eso el canje vive en el backend.
    expect(body.clientSecret).toBeUndefined();
    expect(String(exchange?.init?.body)).not.toContain('client_secret');
  });

  it('translates a known border code', async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(jsonResponse({ error: 'oauth_invalid_token' }, false, 401));

    await expect(exchangeAuthorizationCode(input, fetchImpl)).resolves.toEqual({
      ok: false,
      code: 'oauth_invalid_token',
    });
  });

  it('treats an unknown failure as unavailable', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(jsonResponse({}, false, 500));

    await expect(exchangeAuthorizationCode(input, fetchImpl)).resolves.toEqual({
      ok: false,
      code: 'oauth_unavailable',
    });
  });

  it('rejects a response without oauthToken', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(jsonResponse({ token: 'otro' }));

    await expect(exchangeAuthorizationCode(input, fetchImpl)).resolves.toEqual({
      ok: false,
      code: 'oauth_invalid_token',
    });
  });

  it('treats a network failure as unavailable', async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new Error('offline'));

    await expect(exchangeAuthorizationCode(input, fetchImpl)).resolves.toEqual({
      ok: false,
      code: 'oauth_unavailable',
    });
  });
});

describe('createPendingFlowStore', () => {
  const flow: PendingOAuthFlow = {
    verifier: 'v'.repeat(43),
    state: 'estado-de-esta-visita',
    purpose: 'shop',
  };

  it('round-trips a shop flow and clears it', () => {
    const { storage, values } = memoryStorage();
    const store = createPendingFlowStore({ storage: () => storage, keys: KEYS });

    expect(store.save(flow)).toBe(true);
    expect(values.size).toBe(3);
    expect(store.read()).toEqual(flow);

    store.clear();
    expect(store.read()).toBeNull();
    expect(values.size).toBe(0);
  });

  it('rejects an unknown purpose instead of guessing it', () => {
    const { storage, values } = memoryStorage();
    values.set(KEYS.verifier, flow.verifier);
    values.set(KEYS.state, flow.state);
    values.set(KEYS.purpose, 'otra-superficie');

    const store = createPendingFlowStore({ storage: () => storage, keys: KEYS });

    expect(store.read()).toBeNull();
  });

  it('keeps working in memory when the browser denies storage', () => {
    const store = createPendingFlowStore({ storage: () => null, keys: KEYS });

    expect(store.save(flow)).toBe(true);
    expect(store.read()).toEqual(flow);
    store.clear();
    expect(store.read()).toBeNull();
  });
});

describe('updateShopProfileSchema', () => {
  it('trims the name and keeps the boundary of the contract', () => {
    expect(updateShopProfileSchema.parse({ displayName: '  Compradora  ' })).toEqual({
      displayName: 'Compradora',
    });
    expect(updateShopProfileSchema.safeParse({ displayName: '   ' }).success).toBe(false);
    expect(updateShopProfileSchema.safeParse({ displayName: 'a'.repeat(81) }).success).toBe(false);
    expect(updateShopProfileSchema.safeParse({ displayName: 'a'.repeat(80) }).success).toBe(true);
  });
});
