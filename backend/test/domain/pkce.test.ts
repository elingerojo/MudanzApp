import {
  OAUTH_SCOPE,
  OAUTH_STATE_BYTES,
  PKCE_VERIFIER_BYTES,
  authorizeUrl,
  base64Url,
  codeChallengeS256,
  createCodeVerifier,
  createOAuthState,
  isPkceVerifier,
  oauthDiscoverySchema,
  oauthStateMatches,
  oauthTokenResponseSchema,
  tokenRequestBody,
  type RandomSource,
} from '@mudanzapp/shared';

/**
 * La mitad cliente del flujo de identidad (ciclo 4c-1, `plan-ciclo-4c-event-admin` §5 y decisión §37).
 *
 * El azar entra por argumento, así que la prueba es determinista; el vector del `challenge` es el del
 * apéndice B de la RFC 7636, que es el que comprueba que la implementación hashea lo que dice hashear.
 */

/** Azar determinista: rellena con `value` para poder afirmar la forma sin fijar una cadena al azar. */
function filledWith(value: number): RandomSource {
  return (bytes) => {
    bytes.fill(value);
  };
}

/** Azar que cambia en cada byte: dos invocaciones no pueden coincidir por accidente. */
const counting: RandomSource = (bytes) => {
  bytes.forEach((_, index) => {
    bytes[index] = index;
  });
};

describe('base64Url', () => {
  it('encodes without padding and with the URL alphabet', () => {
    expect(base64Url(new Uint8Array([0x66]))).toBe('Zg');
    expect(base64Url(new Uint8Array([0x66, 0x6f]))).toBe('Zm8');
    expect(base64Url(new Uint8Array([0x66, 0x6f, 0x6f]))).toBe('Zm9v');
    expect(base64Url(new Uint8Array([0x00]))).toBe('AA');
    expect(base64Url(new Uint8Array([0xff, 0xfe, 0xfd]))).toBe('__79');
  });

  it('never emits padding or a plus sign', () => {
    const encoded = base64Url(new Uint8Array([0xfb, 0xff, 0xbf]));

    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
  });
});

describe('createCodeVerifier y createOAuthState', () => {
  it('produce un verificador de la forma que exige la RFC', () => {
    const verifier = createCodeVerifier(counting);

    // 32 bytes llenan 43 caracteres base64url, el mínimo que admite la RFC 7636.
    expect(verifier).toHaveLength(43);
    expect(verifier).toHaveLength(Math.ceil((PKCE_VERIFIER_BYTES * 4) / 3));
    expect(isPkceVerifier(verifier)).toBe(true);
  });

  it('cambian con el azar: no son una constante', () => {
    expect(createCodeVerifier(filledWith(0))).not.toBe(createCodeVerifier(filledWith(1)));
    expect(createOAuthState(filledWith(0))).not.toBe(createOAuthState(filledWith(1)));
  });

  it('el state tiene la misma forma que el verificador', () => {
    const state = createOAuthState(counting);

    expect(state).toHaveLength(Math.ceil((OAUTH_STATE_BYTES * 4) / 3));
    expect(isPkceVerifier(state)).toBe(true);
  });
});

describe('isPkceVerifier', () => {
  it('respeta los límites de la RFC y rechaza caracteres fuera del alfabeto', () => {
    expect(isPkceVerifier('a'.repeat(42))).toBe(false);
    expect(isPkceVerifier('a'.repeat(43))).toBe(true);
    expect(isPkceVerifier('a'.repeat(128))).toBe(true);
    expect(isPkceVerifier('a'.repeat(129))).toBe(false);
    expect(isPkceVerifier(`${'a'.repeat(42)}!`)).toBe(false);
    expect(isPkceVerifier('')).toBe(false);
  });
});

describe('codeChallengeS256', () => {
  it('coincide con el vector del apéndice B de la RFC 7636', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    await expect(codeChallengeS256(verifier)).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('no hashea un verificador que no tiene la forma de la RFC', async () => {
    await expect(codeChallengeS256('demasiado-corto')).rejects.toThrow('pkce-verifier-invalid');
  });
});

describe('authorizeUrl', () => {
  const input = {
    authorizationEndpoint: 'https://id.example/authorize',
    clientId: 'cliente-publico',
    redirectUri: 'https://app.example/auth/callback',
    codeChallenge: 'reto',
    state: 'estado',
  };

  it('lleva los siete parámetros del flujo, con S256 y el redirect codificado', () => {
    const url = authorizeUrl(input);

    expect(url.startsWith('https://id.example/authorize?')).toBe(true);
    expect(url).toContain('response_type=code');
    expect(url).toContain('client_id=cliente-publico');
    expect(url).toContain(`redirect_uri=${encodeURIComponent(input.redirectUri)}`);
    expect(url).toContain('code_challenge=reto');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('state=estado');
    expect(url).toContain(`scope=${encodeURIComponent(OAUTH_SCOPE)}`);
    expect(url).not.toContain('plain');
  });

  it('usa & cuando el endpoint ya trae una consulta', () => {
    const url = authorizeUrl({
      ...input,
      authorizationEndpoint: 'https://id.example/authorize?x=1',
    });

    expect(url).toContain('?x=1&response_type=code');
  });
});

describe('tokenRequestBody', () => {
  it('compone el canje de un cliente público, sin secreto', () => {
    const body = tokenRequestBody({
      code: 'codigo',
      codeVerifier: 'verificador',
      clientId: 'cliente-publico',
      redirectUri: 'https://app.example/auth/callback',
    });

    expect(body).toBe(
      'grant_type=authorization_code&code=codigo&code_verifier=verificador' +
        '&client_id=cliente-publico' +
        `&redirect_uri=${encodeURIComponent('https://app.example/auth/callback')}`,
    );
    expect(body).not.toContain('client_secret');
  });
});

describe('oauthDiscoverySchema', () => {
  it('acepta el documento del emisor con sus dos endpoints', () => {
    const parsed = oauthDiscoverySchema.parse({
      issuer: 'https://id.example',
      authorization_endpoint: 'https://id.example/authorize',
      token_endpoint: 'https://id.example/token',
    });

    expect(parsed.token_endpoint).toBe('https://id.example/token');
  });

  it('rechaza un documento sin endpoint de canje o con un valor que no es URL', () => {
    expect(
      oauthDiscoverySchema.safeParse({ authorization_endpoint: 'https://id.example/authorize' })
        .success,
    ).toBe(false);
    expect(
      oauthDiscoverySchema.safeParse({
        authorization_endpoint: 'no-es-una-url',
        token_endpoint: 'https://id.example/token',
      }).success,
    ).toBe(false);
  });
});

describe('oauthTokenResponseSchema', () => {
  it('exige un id_token no vacío', () => {
    expect(oauthTokenResponseSchema.parse({ id_token: 'jwt', access_token: 'x' })).toEqual({
      id_token: 'jwt',
    });
    expect(oauthTokenResponseSchema.safeParse({ id_token: '   ' }).success).toBe(false);
    expect(oauthTokenResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('oauthStateMatches', () => {
  it('solo acepta el state de esta visita', () => {
    expect(oauthStateMatches('abc', 'abc')).toBe(true);
    expect(oauthStateMatches('abc', 'abd')).toBe(false);
    expect(oauthStateMatches('abc', 'abcd')).toBe(false);
    expect(oauthStateMatches('abc', null)).toBe(false);
    expect(oauthStateMatches('', '')).toBe(false);
  });
});
