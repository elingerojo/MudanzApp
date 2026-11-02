import {
  OAuthError,
  type OAuthCodeExchange,
  type OAuthVerifier,
} from '../../src/identity/oauth.js';
import { startTestApp } from '../support/test-app.js';

/**
 * La frontera del canje del código (ciclo 4c-1b, `plan-ciclo-4c` §16).
 *
 * La ruta no tiene sesión: la identidad la prueba el `id_token` y el canje exige el secreto, que solo
 * vive en el servidor. El verificador se sustituye por un doble porque el canje real necesita un
 * proveedor; lo que se demuestra aquí es que el borde reenvía el cuerpo validado, no inventa el
 * `redirectUri` y traduce el código del adaptador.
 */
const REDIRECT_URI = 'http://localhost:4200/auth/callback';
const VERIFIER = 'v'.repeat(43);

function double(exchange?: (input: OAuthCodeExchange) => Promise<string>): OAuthVerifier {
  return {
    verify: () => Promise.reject(new OAuthError('oauth_invalid_token')),
    ...(exchange === undefined ? {} : { exchangeCode: exchange }),
  };
}

async function post(
  baseUrl: string,
  body: unknown,
): Promise<{ readonly status: number; readonly json: unknown }> {
  const response = await fetch(`${baseUrl}/auth/oauth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  return { status: response.status, json: await response.json() };
}

describe('POST /auth/oauth/exchange', () => {
  it('entrega al adaptador el código, el verificador y el redirect, y devuelve el id_token', async () => {
    const seen: OAuthCodeExchange[] = [];
    const app = await startTestApp('ok', '', {
      oauth: double((input) => {
        seen.push(input);
        return Promise.resolve('id-token-verificado');
      }),
    });

    try {
      const result = await post(app.baseUrl, {
        code: 'codigo-1',
        codeVerifier: VERIFIER,
        redirectUri: REDIRECT_URI,
      });

      expect(result.status).toBe(200);
      expect(result.json).toEqual({ oauthToken: 'id-token-verificado' });
      expect(seen).toEqual([
        { code: 'codigo-1', codeVerifier: VERIFIER, redirectUri: REDIRECT_URI },
      ]);
    } finally {
      await app.close();
    }
  });

  it('rechaza un cuerpo que no tiene la forma del contrato, sin llamar al adaptador', async () => {
    let called = false;
    const app = await startTestApp('ok', '', {
      oauth: double(() => {
        called = true;
        return Promise.resolve('no-deberia');
      }),
    });

    try {
      const shortVerifier = await post(app.baseUrl, {
        code: 'codigo-1',
        codeVerifier: 'corto',
        redirectUri: REDIRECT_URI,
      });
      expect(shortVerifier.status).toBe(400);
      expect(shortVerifier.json).toEqual({ error: 'validation_failed' });

      const badRedirect = await post(app.baseUrl, {
        code: 'codigo-1',
        codeVerifier: VERIFIER,
        redirectUri: 'no-es-una-url',
      });
      expect(badRedirect.status).toBe(400);

      expect(called).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('responde oauth_not_configured cuando el adaptador no sabe canjear', async () => {
    const app = await startTestApp('ok', '', { oauth: double() });

    try {
      const result = await post(app.baseUrl, {
        code: 'codigo-1',
        codeVerifier: VERIFIER,
        redirectUri: REDIRECT_URI,
      });

      expect(result.status).toBe(503);
      expect(result.json).toEqual({ error: 'oauth_not_configured' });
    } finally {
      await app.close();
    }
  });

  it('traduce el fallo del adaptador con su código estable', async () => {
    const app = await startTestApp('ok', '', {
      oauth: double(() => Promise.reject(new OAuthError('oauth_invalid_token'))),
    });

    try {
      const invalid = await post(app.baseUrl, {
        code: 'codigo-1',
        codeVerifier: VERIFIER,
        redirectUri: REDIRECT_URI,
      });
      expect(invalid.status).toBe(401);
      expect(invalid.json).toEqual({ error: 'oauth_invalid_token' });
    } finally {
      await app.close();
    }

    const unavailable = await startTestApp('ok', '', {
      oauth: double(() => Promise.reject(new OAuthError('oauth_unavailable'))),
    });

    try {
      const result = await post(unavailable.baseUrl, {
        code: 'codigo-1',
        codeVerifier: VERIFIER,
        redirectUri: REDIRECT_URI,
      });
      expect(result.status).toBe(503);
      expect(result.json).toEqual({ error: 'oauth_unavailable' });
    } finally {
      await unavailable.close();
    }
  });
});
