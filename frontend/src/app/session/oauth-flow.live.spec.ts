import type { OAuthClientConfig } from './oauth-config';
import { OAuthFlowError } from './oauth-flow';
import { LiveOAuthFlow } from './oauth-flow.live';
import { clearPendingFlow, savePendingFlow } from './oauth-session';

/**
 * El adaptador `live` del flujo de identidad (ciclos 4c-1, 4c-1b y 4c-1c).
 *
 * `fetch` se sustituye por un doble. Desde 4c-1b el navegador **no** canjea contra el proveedor: entrega
 * código y verificador al backend, que es el único que puede guardar el secreto. Desde 4c-1c el flujo
 * además lleva **propósito**, y la prueba comprueba que vuelve intacto: es lo que decide si el callback
 * reclama un evento o vuelve a entrar con una cuenta.
 */
const CONFIG: OAuthClientConfig = {
  mode: 'live',
  issuer: 'https://id.example',
  clientId: 'cliente-publico',
};

const API = '/api';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('LiveOAuthFlow', () => {
  let calls: { readonly url: string; readonly init?: RequestInit }[];

  beforeEach(() => {
    clearPendingFlow();
    calls = [];

    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      calls.push({ url, init });

      return Promise.resolve(jsonResponse({ oauthToken: 'id-token-verificado' }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearPendingFlow();
  });

  it('no empieza sin emisor y cliente: falla con un código estable', async () => {
    const flow = new LiveOAuthFlow({ mode: 'live', issuer: '', clientId: 'x' }, API);

    await expect(flow.begin('claim')).rejects.toMatchObject({ code: 'oauth_not_configured' });
    expect(calls).toHaveLength(0);
  });

  it('entrega el código y el verificador al backend y devuelve el token con su propósito', async () => {
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'estado-de-esta-visita', purpose: 'claim' });

    const flow = new LiveOAuthFlow(CONFIG, API);
    const result = await flow.complete({
      code: 'codigo',
      state: 'estado-de-esta-visita',
      error: null,
    });

    expect(result).toEqual({ idToken: 'id-token-verificado', purpose: 'claim' });
    expect(calls).toHaveLength(1);

    const exchange = calls[0];
    expect(exchange?.url).toBe(`${API}/auth/oauth/exchange`);
    expect(exchange?.init?.method).toBe('POST');

    const body = JSON.parse(String(exchange?.init?.body)) as {
      readonly code?: string;
      readonly codeVerifier?: string;
      readonly redirectUri?: string;
      readonly clientSecret?: string;
    };
    expect(body.code).toBe('codigo');
    expect(body.codeVerifier).toBe('v'.repeat(43));
    expect(body.redirectUri).toBe(`${globalThis.location.origin}/auth/callback`);

    // El navegador no lleva el secreto: por eso el canje vive en el backend.
    expect(body.clientSecret).toBeUndefined();
    expect(String(exchange?.init?.body)).not.toContain('client_secret');
  });

  it('devuelve el propósito del regreso sin cambiarlo', async () => {
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'estado', purpose: 'signin' });

    const flow = new LiveOAuthFlow(CONFIG, API);
    const result = await flow.complete({ code: 'codigo', state: 'estado', error: null });

    expect(result.purpose).toBe('signin');
  });

  it('no entrega nada al backend cuando el state no es de esta visita', async () => {
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'esperado', purpose: 'claim' });

    const flow = new LiveOAuthFlow(CONFIG, API);

    await expect(
      flow.complete({ code: 'codigo', state: 'otro', error: null }),
    ).rejects.toBeInstanceOf(OAuthFlowError);
    await expect(
      flow.complete({ code: 'codigo', state: 'otro', error: null }),
    ).rejects.toMatchObject({ code: 'oauth_state_mismatch' });
    expect(calls).toHaveLength(0);
  });

  it('trata un rechazo del proveedor como negación, no como visita fallida', async () => {
    const flow = new LiveOAuthFlow(CONFIG, API);

    await expect(
      flow.complete({ code: null, state: null, error: 'access_denied' }),
    ).rejects.toMatchObject({ code: 'oauth_denied' });
  });

  it('traduce el código del borde cuando el canje no se puede hacer', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(jsonResponse({ error: 'oauth_invalid_token' }, false, 401)),
    );
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'estado', purpose: 'claim' });

    const flow = new LiveOAuthFlow(CONFIG, API);

    await expect(
      flow.complete({ code: 'codigo', state: 'estado', error: null }),
    ).rejects.toMatchObject({ code: 'oauth_invalid_token' });
  });

  it('trata un fallo sin código conocido como indisponibilidad', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse({}, false, 500)));
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'estado', purpose: 'claim' });

    const flow = new LiveOAuthFlow(CONFIG, API);

    await expect(
      flow.complete({ code: 'codigo', state: 'estado', error: null }),
    ).rejects.toMatchObject({ code: 'oauth_unavailable' });
  });

  it('no acepta una respuesta sin oauthToken', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse({ token: 'otro' })));
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'estado', purpose: 'claim' });

    const flow = new LiveOAuthFlow(CONFIG, API);

    await expect(
      flow.complete({ code: 'codigo', state: 'estado', error: null }),
    ).rejects.toMatchObject({ code: 'oauth_invalid_token' });
  });
});
