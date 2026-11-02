import { FAKE_OAUTH_CODE, FAKE_ID_TOKEN, FakeOAuthFlow } from './oauth-flow.fake';
import { clearPendingFlow, readPendingFlow } from './oauth-session';

/**
 * El doble del flujo (ciclos 4c-1 y 4c-1c).
 *
 * El doble es determinista pero **no** permisivo: verifica el `state` igual que `live` y devuelve el
 * propósito con el que se abrió, porque de eso depende que el callback reclame un evento o vuelva a
 * entrar con una cuenta. Un doble más laxo escondería justo el defecto que este corte debe atrapar.
 */
interface NavigateArgs {
  readonly commands: readonly unknown[];
  readonly extras: { readonly queryParams?: Record<string, string> } | undefined;
}

function fakeRouter(): {
  navigate: (commands: unknown[], extras: NavigateArgs['extras']) => Promise<boolean>;
  calls: NavigateArgs[];
} {
  const calls: NavigateArgs[] = [];

  return {
    calls,
    navigate: (commands, extras) => {
      calls.push({ commands, extras });
      return Promise.resolve(true);
    },
  };
}

describe('FakeOAuthFlow', () => {
  beforeEach(() => {
    clearPendingFlow();
  });

  afterEach(() => {
    clearPendingFlow();
  });

  it('navega a la vuelta del proveedor con un código y el state que acaba de guardar', async () => {
    const router = fakeRouter();
    const flow = new FakeOAuthFlow(router as never);

    await flow.begin('claim');

    const pending = readPendingFlow();
    expect(pending).not.toBeNull();
    expect(pending?.purpose).toBe('claim');
    expect(router.calls).toHaveLength(1);
    expect(router.calls[0]?.commands).toEqual(['/auth/callback']);
    expect(router.calls[0]?.extras?.queryParams).toEqual({
      code: FAKE_OAUTH_CODE,
      state: pending?.state,
    });
  });

  it('guarda el propósito del regreso cuando se abre para entrar', async () => {
    const router = fakeRouter();
    const flow = new FakeOAuthFlow(router as never);

    await flow.begin('signin');

    expect(readPendingFlow()?.purpose).toBe('signin');
  });

  it('devuelve un id_token fijo y el propósito cuando el state corresponde', async () => {
    const router = fakeRouter();
    const flow = new FakeOAuthFlow(router as never);

    await flow.begin('signin');
    const state = readPendingFlow()?.state ?? '';

    await expect(flow.complete({ code: FAKE_OAUTH_CODE, state, error: null })).resolves.toEqual({
      idToken: FAKE_ID_TOKEN,
      purpose: 'signin',
    });
  });

  it('rechaza un state ajeno y un rechazo explícito del proveedor', async () => {
    const router = fakeRouter();
    const flow = new FakeOAuthFlow(router as never);

    await flow.begin('claim');

    await expect(
      flow.complete({ code: FAKE_OAUTH_CODE, state: 'otro', error: null }),
    ).rejects.toMatchObject({ code: 'oauth_state_mismatch' });
    await expect(
      flow.complete({ code: null, state: null, error: 'access_denied' }),
    ).rejects.toMatchObject({ code: 'oauth_denied' });
  });
});
