import type { OAuthClientConfig } from './oauth-config';
import { OAuthFlowError } from './oauth-flow';
import { LiveOAuthFlow } from './oauth-flow.live';
import { clearPendingFlow, savePendingFlow } from './oauth-session';

/**
 * El adaptador `live` del flujo de identidad (ciclos 4c-1 y 4c-1b).
 *
 * `fetch` se sustituye por un doble. Desde 4c-1b el navegador **no** canjea contra el proveedor: entrega
 * código y verificador al backend, que es el único que puede guardar el secreto. Lo que se comprueba
 * aquí es esa mitad pública —el `state` de esta visita, el cuerpo que viaja al backend y la traducción
 * del fallo por código— y que el navegador nunca lleva un secreto.
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

    await expect(flow.begin()).rejects.toMatchObject({ code: 'oauth_not_configured' });
    expect(calls).toHaveLength(0);
  });

  it('entrega el código y el verificador al backend y devuelve su id_token', async () => {
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'estado-de-esta-visita' });

    const flow = new LiveOAuthFlow(CONFIG, API);
    const token = await flow.complete({
      code: 'codigo',
      state: 'estado-de-esta-visita',
      error: null,
    });

    expect(token).toBe('id-token-verificado');
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

  it('no entrega nada al backend cuando el state no es de esta visita', async () => {
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'esperado' });

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
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'estado' });

    const flow = new LiveOAuthFlow(CONFIG, API);

    await expect(
      flow.complete({ code: 'codigo', state: 'estado', error: null }),
    ).rejects.toMatchObject({ code: 'oauth_invalid_token' });
  });

  it('trata un fallo sin código conocido como indisponibilidad', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse({}, false, 500)));
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'estado' });

    const flow = new LiveOAuthFlow(CONFIG, API);

    await expect(
      flow.complete({ code: 'codigo', state: 'estado', error: null }),
    ).rejects.toMatchObject({ code: 'oauth_unavailable' });
  });

  it('no acepta una respuesta sin oauthToken', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse({ token: 'otro' })));
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'estado' });

    const flow = new LiveOAuthFlow(CONFIG, API);

    await expect(
      flow.complete({ code: 'codigo', state: 'estado', error: null }),
    ).rejects.toMatchObject({ code: 'oauth_invalid_token' });
  });
});
