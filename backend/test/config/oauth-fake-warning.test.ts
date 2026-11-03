import { oauthWarnings, type OAuthConfig } from '../../src/config.js';

/**
 * Los avisos de arranque de la integración de identidad (ciclo 4c-3).
 *
 * El hueco que cierra: R2 y AI ya advertían cuando corren con su doble determinista y OAUTH no, así
 * que un despliegue podía resolver cuentas con el `fake` sin ninguna señal en `config-warning`.
 *
 * Se prueba la decisión pura y no el módulo importado: `config.ts` lee `process.env` una sola vez al
 * importarse, y reimportarlo para cambiar el entorno haría la prueba depender del orden de los
 * módulos. Aquí se le pasan las cuatro formas que el arranque puede encontrar, y ninguna imprime un
 * valor.
 */
const FAKE: OAuthConfig = {
  mode: 'fake',
  issuer: null,
  clientId: null,
  clientSecret: null,
};

const LIVE_INCOMPLETE: OAuthConfig = {
  mode: 'live',
  issuer: 'https://issuer.example',
  clientId: 'client-id',
  clientSecret: null,
};

const LIVE: OAuthConfig = {
  mode: 'live',
  issuer: 'https://issuer.example',
  clientId: 'client-id',
  clientSecret: 'client-secret',
};

describe('oauthWarnings', () => {
  it('warns when the identity integration runs on the deterministic double', () => {
    expect(oauthWarnings(FAKE)).toEqual([
      'OAUTH_MODE is fake: accounts come from a deterministic double and no identity provider is called',
    ]);
  });

  it('stays silent when it runs live with its three pieces', () => {
    expect(oauthWarnings(LIVE)).toEqual([]);
  });

  it('keeps the incomplete-configuration warning distinct from the fake one', () => {
    expect(oauthWarnings(LIVE_INCOMPLETE)).toEqual([
      'OAUTH_MODE is live but its configuration is incomplete; the first identity request will report oauth_not_configured',
    ]);
  });

  it('rejects a mode that is neither live nor fake before anything else', () => {
    expect(oauthWarnings({ ...LIVE, mode: 'staging' })).toEqual([
      'OAUTH_MODE is not live or fake; the first identity request will report oauth_mode_invalid',
    ]);
  });
});
