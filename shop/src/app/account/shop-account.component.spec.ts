import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OAuthFlowError, type IdentityUser } from '@mudanzapp/shared';

import { SHOP_OAUTH_FLOW } from '../session/shop-oauth-flow';
import { ShopSessionStore } from '../session/shop-session.store';
import { ShopAccountComponent } from './shop-account.component';

const INVITADO: IdentityUser = { id: 'user-shop', displayName: 'Invitado', isAdmin: false };

function accountStore() {
  const user = signal<IdentityUser | null>(null);
  const identityFailed = signal(false);

  return {
    hasSession: computed(() => user() !== null),
    user,
    identityFailed,
    clear: vi.fn(() => {
      user.set(null);
    }),
    updateDisplayName: vi.fn((displayName: string) => {
      const next = { ...INVITADO, displayName };
      user.set(next);
      return Promise.resolve(next);
    }),
    setUser: (next: IdentityUser | null) => {
      user.set(next);
    },
    failIdentity: () => {
      identityFailed.set(true);
    },
  };
}

async function setup(store: ReturnType<typeof accountStore>) {
  const flow = { begin: vi.fn(() => Promise.resolve()), complete: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [ShopAccountComponent],
    providers: [
      { provide: ShopSessionStore, useValue: store },
      { provide: SHOP_OAUTH_FLOW, useValue: flow },
    ],
  }).compileComponents();

  return { flow };
}

function elementOf(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function inputOf(fixture: { nativeElement: unknown }): HTMLInputElement {
  const input = elementOf(fixture).querySelector(
    '[data-testid="shop-account-name-input"]',
  ) as HTMLInputElement | null;

  if (input === null) {
    throw new Error('missing-name-input');
  }

  return input;
}

function typeName(fixture: { nativeElement: unknown; detectChanges(): void }, value: string): void {
  const input = inputOf(fixture);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

/**
 * La cuenta del visitante (ciclo 4d): entrar sin sesión, ver el nombre y fijarlo después, y cerrar la
 * sesión local.
 */
describe('ShopAccountComponent', () => {
  it('offers the sign-in action when there is no session', async () => {
    const store = accountStore();
    const { flow } = await setup(store);

    const fixture = TestBed.createComponent(ShopAccountComponent);
    fixture.detectChanges();

    const signin = elementOf(fixture).querySelector(
      '[data-testid="shop-account-signin"]',
    ) as HTMLButtonElement | null;
    expect(signin).not.toBeNull();

    signin?.click();
    await fixture.whenStable();

    expect(flow.begin).toHaveBeenCalled();
  });

  it('shows the account name and saves an optional new one', async () => {
    const store = accountStore();
    store.setUser(INVITADO);
    const { flow } = await setup(store);
    void flow;

    const fixture = TestBed.createComponent(ShopAccountComponent);
    fixture.detectChanges();

    expect(
      elementOf(fixture).querySelector('[data-testid="shop-account-name"]')?.textContent,
    ).toContain('Invitado');
    expect(inputOf(fixture).value).toBe('Invitado');

    typeName(fixture, '  Compradora  ');
    (
      elementOf(fixture).querySelector(
        '[data-testid="shop-account-name-save"]',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.updateDisplayName).toHaveBeenCalledWith('Compradora');
    expect(elementOf(fixture).querySelector('[data-testid="shop-account-saved"]')).not.toBeNull();
  });

  it('refuses an empty name without writing', async () => {
    const store = accountStore();
    store.setUser(INVITADO);
    await setup(store);

    const fixture = TestBed.createComponent(ShopAccountComponent);
    fixture.detectChanges();

    typeName(fixture, '   ');
    (
      elementOf(fixture).querySelector(
        '[data-testid="shop-account-name-save"]',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.updateDisplayName).not.toHaveBeenCalled();
    expect(
      elementOf(fixture).querySelector('[data-testid="shop-account-error"]')?.textContent,
    ).toContain('Escribe un nombre');
  });

  it('explains a failed save and a stale session', async () => {
    const store = accountStore();
    store.setUser(INVITADO);
    store.updateDisplayName.mockRejectedValueOnce(new OAuthFlowError('oauth_unavailable'));
    await setup(store);

    const fixture = TestBed.createComponent(ShopAccountComponent);
    fixture.detectChanges();

    typeName(fixture, 'Compradora');
    (
      elementOf(fixture).querySelector(
        '[data-testid="shop-account-name-save"]',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      elementOf(fixture).querySelector('[data-testid="shop-account-error"]')?.textContent,
    ).toContain('No se pudo hablar');

    store.failIdentity();
    fixture.detectChanges();
    expect(
      elementOf(fixture).querySelector('[data-testid="shop-account-session-error"]')?.textContent,
    ).toContain('ya no sirve');
  });

  it('clears the local session when signing out', async () => {
    const store = accountStore();
    store.setUser(INVITADO);
    await setup(store);

    const fixture = TestBed.createComponent(ShopAccountComponent);
    fixture.detectChanges();

    (
      elementOf(fixture).querySelector('[data-testid="shop-account-signout"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(store.clear).toHaveBeenCalled();
    expect(elementOf(fixture).querySelector('[data-testid="shop-account-signin"]')).not.toBeNull();
  });
});
