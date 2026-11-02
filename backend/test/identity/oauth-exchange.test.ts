import { SignJWT, exportJWK, generateKeyPair } from 'jose';

import { createLiveOAuthVerifier } from '../../src/identity/oauth-live.js';

/**
 * El canje del código en el adaptador `live` (ciclo 4c-1b, `plan-ciclo-4c` §16).
 *
 * El proveedor se sustituye por un doble de `fetch` que publica un documento de descubrimiento, un
 * JWKS y un `id_token` firmado de verdad con una clave efímera. Así la prueba demuestra lo que importa:
 * el canje **lleva el secreto**, y el token devuelto pasó por la verificación de firma, emisor y
 * audiencia antes de salir del adaptador.
 */
const ISSUER = 'https://id.example';
const CLIENT_ID = 'cliente-de-prueba';
const CLIENT_SECRET = 'secreto-de-prueba';
const REDIRECT_URI = 'http://localhost:4200/auth/callback';

interface Call {
  readonly url: string;
  readonly init?: RequestInit;
}

function json(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('live oauth code exchange', () => {
  let calls: Call[];
  let idToken: string;
  let jwks: unknown;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] };

    idToken = await new SignJWT({ sub: 'sujeto-1', name: 'Cuenta de prueba' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  });

  beforeEach(() => {
    calls = [];

    vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init });

      if (url.endsWith('/.well-known/openid-configuration')) {
        return Promise.resolve(
          json({ jwks_uri: `${ISSUER}/jwks`, token_endpoint: `${ISSUER}/token` }),
        );
      }

      if (url === `${ISSUER}/jwks`) {
        return Promise.resolve(json(jwks));
      }

      return Promise.resolve(json({ id_token: idToken }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const config = {
    mode: 'live',
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  };

  it('canjea con el secreto y devuelve el token ya verificado', async () => {
    const flow = createLiveOAuthVerifier(config);
    const exchange = flow.exchangeCode;
    expect(exchange).toBeDefined();
    if (exchange === undefined) {
      return;
    }

    const token = await exchange({
      code: 'codigo-1',
      codeVerifier: 'v'.repeat(43),
      redirectUri: REDIRECT_URI,
    });

    expect(token).toBe(idToken);

    const tokenCall = calls.find((call) => call.url === `${ISSUER}/token`);
    expect(tokenCall).toBeDefined();

    const body = String(tokenCall?.init?.body ?? '');
    expect(tokenCall?.init?.method).toBe('POST');
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code=codigo-1');
    expect(body).toContain(`code_verifier=${'v'.repeat(43)}`);
    expect(body).toContain(`client_id=${CLIENT_ID}`);
    expect(body).toContain(`client_secret=${CLIENT_SECRET}`);
    expect(body).toContain(`redirect_uri=${encodeURIComponent(REDIRECT_URI)}`);
  });

  it('exige las tres credenciales del proveedor', async () => {
    const flow = createLiveOAuthVerifier({ ...config, clientSecret: null });
    const exchange = flow.exchangeCode;
    expect(exchange).toBeDefined();
    if (exchange === undefined) {
      return;
    }

    await expect(
      exchange({ code: 'codigo-1', codeVerifier: 'v'.repeat(43), redirectUri: REDIRECT_URI }),
    ).rejects.toMatchObject({ code: 'oauth_not_configured' });
    expect(calls).toHaveLength(0);
  });

  it('falla con código estable cuando el proveedor rechaza el canje', async () => {
    vi.stubGlobal('fetch', (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      return Promise.resolve(
        url.endsWith('/.well-known/openid-configuration')
          ? json({ jwks_uri: `${ISSUER}/jwks`, token_endpoint: `${ISSUER}/token` })
          : json({ error: 'invalid_grant' }, false, 400),
      );
    });

    const flow = createLiveOAuthVerifier(config);
    const exchange = flow.exchangeCode;
    if (exchange === undefined) {
      return;
    }

    await expect(
      exchange({ code: 'codigo-1', codeVerifier: 'v'.repeat(43), redirectUri: REDIRECT_URI }),
    ).rejects.toMatchObject({ code: 'oauth_invalid_token' });
  });

  it('no devuelve nada cuando la respuesta no trae id_token', async () => {
    vi.stubGlobal('fetch', (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      return Promise.resolve(
        url.endsWith('/.well-known/openid-configuration')
          ? json({ jwks_uri: `${ISSUER}/jwks`, token_endpoint: `${ISSUER}/token` })
          : json({ token_type: 'Bearer' }),
      );
    });

    const flow = createLiveOAuthVerifier(config);
    const exchange = flow.exchangeCode;
    if (exchange === undefined) {
      return;
    }

    await expect(
      exchange({ code: 'codigo-1', codeVerifier: 'v'.repeat(43), redirectUri: REDIRECT_URI }),
    ).rejects.toMatchObject({ code: 'oauth_invalid_token' });
  });

  it('rechaza un id_token que no verifica contra el JWKS del emisor', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({ sub: 'otro' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    vi.stubGlobal('fetch', (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      return Promise.resolve(
        url.endsWith('/.well-known/openid-configuration')
          ? json({ jwks_uri: `${ISSUER}/jwks`, token_endpoint: `${ISSUER}/token` })
          : json({ id_token: forged }),
      );
    });

    const flow = createLiveOAuthVerifier(config);
    const exchange = flow.exchangeCode;
    if (exchange === undefined) {
      return;
    }

    await expect(
      exchange({ code: 'codigo-1', codeVerifier: 'v'.repeat(43), redirectUri: REDIRECT_URI }),
    ).rejects.toMatchObject({ code: 'oauth_invalid_token' });
  });
});
