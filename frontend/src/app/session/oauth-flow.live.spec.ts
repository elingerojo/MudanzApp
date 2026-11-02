import type { OAuthClientConfig } from './oauth-config';
import { OAuthFlowError } from './oauth-flow';
import { LiveOAuthFlow } from './oauth-flow.live';
import { clearPendingFlow, savePendingFlow } from './oauth-session';

/**
 * El adaptador `live` del flujo de identidad (ciclo 4c-1).
 *
 * `fetch` se sustituye por un doble: lo que se comprueba es el contrato del flujo —descubrimiento
 * validado, `state` de esta visita, canje de cliente público y `id_token` de vuelta—, no el proveedor
 * real, que es un hecho del dueño y no corre en pruebas (`stack` §9).
 */
const CONFIG: OAuthClientConfig = {
  mode: 'live',
  issuer: 'https://id.example',
  clientId: 'cliente-publico',
};

const DISCOVERY = {
  issuer: 'https://id.example',
  authorization_endpoint: 'https://id.example/authorize',
  token_endpoint: 'https://id.example/token',
};

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('LiveOAuthFlow', () => {
  let calls: { readonly url: string; readonly init?: RequestInit }[];

  beforeEach(() => {
    clearPendingFlow();
    calls = [];

    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      calls.push({ url, init });

      if (url.endsWith('/.well-known/openid-configuration')) {
        return Promise.resolve(jsonResponse(DISCOVERY));
      }

      return Promise.resolve(jsonResponse({ id_token: 'id-token-verificado' }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearPendingFlow();
  });

  it('no empieza sin emisor y cliente: falla con un código estable', async () => {
    const flow = new LiveOAuthFlow({ mode: 'live', issuer: '', clientId: 'x' });

    await expect(flow.begin()).rejects.toMatchObject({ code: 'oauth_not_configured' });
    expect(calls).toHaveLength(0);
  });

  it('descubre los endpoints y canjea el código con el verificador, sin secreto', async () => {
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'estado-de-esta-visita' });

    const flow = new LiveOAuthFlow(CONFIG);
    const idToken = await flow.complete({
      code: 'codigo',
      state: 'estado-de-esta-visita',
      error: null,
    });

    expect(idToken).toBe('id-token-verificado');
    expect(calls[0]?.url).toBe('https://id.example/.well-known/openid-configuration');

    const exchange = calls[1];
    expect(exchange?.url).toBe('https://id.example/token');
    expect(exchange?.init?.method).toBe('POST');

    const body = String(exchange?.init?.body ?? '');
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code=codigo');
    expect(body).toContain(`code_verifier=${'v'.repeat(43)}`);
    expect(body).toContain('client_id=cliente-publico');
    expect(body).toContain(
      `redirect_uri=${encodeURIComponent(`${globalThis.location.origin}/auth/callback`)}`,
    );
    expect(body).not.toContain('client_secret');
  });

  it('no canjea un state que no es de esta visita', async () => {
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'esperado' });

    const flow = new LiveOAuthFlow(CONFIG);

    await expect(
      flow.complete({ code: 'codigo', state: 'otro', error: null }),
    ).rejects.toBeInstanceOf(OAuthFlowError);
    await expect(
      flow.complete({ code: 'codigo', state: 'otro', error: null }),
    ).rejects.toMatchObject({ code: 'oauth_state_mismatch' });
    expect(calls).toHaveLength(0);
  });

  it('trata un rechazo del proveedor como negación, no como visita fallida', async () => {
    const flow = new LiveOAuthFlow(CONFIG);

    await expect(
      flow.complete({ code: null, state: null, error: 'access_denied' }),
    ).rejects.toMatchObject({ code: 'oauth_denied' });
  });

  it('falla ruidoso cuando el proveedor no entrega un documento usable', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse({ hola: 'mundo' })));
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'estado' });

    const flow = new LiveOAuthFlow(CONFIG);

    await expect(
      flow.complete({ code: 'codigo', state: 'estado', error: null }),
    ).rejects.toMatchObject({ code: 'oauth_unavailable' });
  });

  it('falla ruidoso cuando el canje no devuelve id_token', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(
        url.endsWith('/.well-known/openid-configuration')
          ? jsonResponse(DISCOVERY)
          : jsonResponse({ token_type: 'Bearer' }),
      ),
    );
    savePendingFlow({ verifier: 'v'.repeat(43), state: 'estado' });

    const flow = new LiveOAuthFlow(CONFIG);

    await expect(
      flow.complete({ code: 'codigo', state: 'estado', error: null }),
    ).rejects.toMatchObject({ code: 'oauth_invalid_token' });
  });
});
