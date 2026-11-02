import { FAKE_OAUTH_CODE, FAKE_ID_TOKEN, FakeOAuthFlow } from './oauth-flow.fake';
import { clearPendingFlow, readPendingFlow } from './oauth-session';

/**
 * El doble del flujo (ciclo 4c-1, `stack` §9).
 *
 * El doble es determinista pero **no** permisivo: verifica el `state` igual que `live`, porque esa
 * defensa es parte del corte y un doble que la saltara escondería el defecto que debe atrapar.
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

    await flow.begin();

    const pending = readPendingFlow();
    expect(pending).not.toBeNull();
    expect(router.calls).toHaveLength(1);
    expect(router.calls[0]?.commands).toEqual(['/auth/callback']);
    expect(router.calls[0]?.extras?.queryParams).toEqual({
      code: FAKE_OAUTH_CODE,
      state: pending?.state,
    });
  });

  it('devuelve un id_token fijo cuando el state corresponde', async () => {
    const router = fakeRouter();
    const flow = new FakeOAuthFlow(router as never);

    await flow.begin();
    const state = readPendingFlow()?.state ?? '';

    await expect(flow.complete({ code: FAKE_OAUTH_CODE, state, error: null })).resolves.toBe(
      FAKE_ID_TOKEN,
    );
  });

  it('rechaza un state ajeno y un rechazo explícito del proveedor', async () => {
    const router = fakeRouter();
    const flow = new FakeOAuthFlow(router as never);

    await flow.begin();

    await expect(
      flow.complete({ code: FAKE_OAUTH_CODE, state: 'otro', error: null }),
    ).rejects.toMatchObject({ code: 'oauth_state_mismatch' });
    await expect(
      flow.complete({ code: null, state: null, error: 'access_denied' }),
    ).rejects.toMatchObject({ code: 'oauth_denied' });
  });
});
