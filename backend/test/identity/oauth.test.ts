import { createOAuthVerifier } from '../../src/identity/oauth.js';

/**
 * Costura OAUTH: el doble determinista y los fallos de configuración con código estable.
 * La verificación de firma del adaptador `live` se ejerce contra el proveedor, no en unit.
 */
describe('oauth verifier', () => {
  it('emits the fixed fake subject for any non-empty token', async () => {
    const verifier = createOAuthVerifier({
      mode: 'fake',
      issuer: null,
      clientId: null,
      clientSecret: null,
    });

    await expect(verifier.verify('assertion-a')).resolves.toEqual({
      issuer: 'https://fake.oauth.local',
      subject: 'fake-subject',
      displayName: 'Invitado',
    });
  });

  it('rejects an empty assertion in fake mode', async () => {
    const verifier = createOAuthVerifier({
      mode: 'fake',
      issuer: null,
      clientId: null,
      clientSecret: null,
    });

    await expect(verifier.verify('   ')).rejects.toMatchObject({ code: 'oauth_invalid_token' });
  });

  it('fails with a stable code when the mode is not live or fake', async () => {
    const verifier = createOAuthVerifier({
      mode: 'sometimes',
      issuer: null,
      clientId: null,
      clientSecret: null,
    });

    await expect(verifier.verify('assertion')).rejects.toMatchObject({
      code: 'oauth_mode_invalid',
    });
  });

  it('reports missing live configuration without touching the network', async () => {
    const verifier = createOAuthVerifier({
      mode: 'live',
      issuer: null,
      clientId: null,
      clientSecret: null,
    });

    await expect(verifier.verify('assertion')).rejects.toMatchObject({
      code: 'oauth_not_configured',
    });
  });
});
