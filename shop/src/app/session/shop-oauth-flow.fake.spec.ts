import { clearShopPendingFlow, readShopPendingFlow } from './shop-oauth-pending';
import {
  FAKE_SHOP_OAUTH_CODE,
  FAKE_SHOP_ID_TOKEN,
  FakeShopOAuthFlow,
} from './shop-oauth-flow.fake';

/**
 * El doble del flujo de la tienda (ciclo 4d).
 *
 * Es determinista pero **no** permisivo: verifica el `state` igual que `live` y marca el flujo con el
 * propósito `shop`, porque un doble más laxo escondería justo el defecto que este corte debe atrapar.
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

describe('FakeShopOAuthFlow', () => {
  beforeEach(() => {
    clearShopPendingFlow();
  });

  afterEach(() => {
    clearShopPendingFlow();
  });

  it('navigates to the callback with a code and the state it just saved', async () => {
    const router = fakeRouter();
    const flow = new FakeShopOAuthFlow(router as never);

    await flow.begin();

    const pending = readShopPendingFlow();
    expect(pending?.purpose).toBe('shop');
    expect(router.calls).toHaveLength(1);
    expect(router.calls[0]?.commands).toEqual(['/auth/callback']);
    expect(router.calls[0]?.extras?.queryParams).toEqual({
      code: FAKE_SHOP_OAUTH_CODE,
      state: pending?.state,
    });
  });

  it('returns the fixed token when the state matches', async () => {
    const router = fakeRouter();
    const flow = new FakeShopOAuthFlow(router as never);

    await flow.begin();
    const state = readShopPendingFlow()?.state ?? '';

    await expect(
      flow.complete({ code: FAKE_SHOP_OAUTH_CODE, state, error: null }),
    ).resolves.toEqual({ idToken: FAKE_SHOP_ID_TOKEN });
  });

  it('rejects a foreign state and an explicit provider denial', async () => {
    const router = fakeRouter();
    const flow = new FakeShopOAuthFlow(router as never);

    await flow.begin();

    await expect(
      flow.complete({ code: FAKE_SHOP_OAUTH_CODE, state: 'otro', error: null }),
    ).rejects.toMatchObject({ code: 'oauth_state_mismatch' });
    await expect(
      flow.complete({ code: null, state: null, error: 'access_denied' }),
    ).rejects.toMatchObject({ code: 'oauth_denied' });
  });
});
