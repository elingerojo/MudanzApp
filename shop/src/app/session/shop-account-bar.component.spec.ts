import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { OAuthFlowError, type IdentityUser } from '@mudanzapp/shared';

import { ShopAccountBarComponent } from './shop-account-bar.component';
import { SHOP_OAUTH_FLOW } from './shop-oauth-flow';
import { clearShopReturnTo, readShopReturnTo } from './shop-return-to';
import { ShopSessionStore } from './shop-session.store';

@Component({ selector: 'app-test-empty', template: '' })
class EmptyComponent {}

const INVITADO: IdentityUser = { id: 'user-shop', displayName: 'Invitado', isAdmin: false };

function barStore() {
  const user = signal<IdentityUser | null>(null);

  return {
    user,
    clear: vi.fn(() => {
      user.set(null);
    }),
    setUser: (next: IdentityUser | null) => {
      user.set(next);
    },
  };
}

async function setup(
  store: ReturnType<typeof barStore>,
  begin: () => Promise<void> = () => Promise.resolve(),
  routes: Parameters<typeof provideRouter>[0] = [],
) {
  await TestBed.configureTestingModule({
    imports: [ShopAccountBarComponent],
    providers: [
      provideRouter(routes),
      { provide: ShopSessionStore, useValue: store },
      { provide: SHOP_OAUTH_FLOW, useValue: { begin: vi.fn(begin), complete: vi.fn() } },
    ],
  }).compileComponents();
}

function elementOf(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/**
 * La barra de acceso opcional (extensión de 4d): entra desde la página pública, recuerda a dónde
 * volver y no repite el control en la cuenta ni en la vuelta del proveedor.
 */
describe('ShopAccountBarComponent', () => {
  afterEach(() => {
    clearShopReturnTo();
  });

  it('offers sign-in and remembers the current public page', async () => {
    const store = barStore();
    await setup(store);

    const fixture = TestBed.createComponent(ShopAccountBarComponent);
    fixture.detectChanges();

    (
      elementOf(fixture).querySelector(
        '[data-testid="shop-account-bar-signin"]',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();

    expect(readShopReturnTo()).toBe('/');
  });

  it('shows the account name and signs out locally', async () => {
    const store = barStore();
    store.setUser(INVITADO);
    await setup(store);

    const fixture = TestBed.createComponent(ShopAccountBarComponent);
    fixture.detectChanges();

    expect(
      elementOf(fixture).querySelector('[data-testid="shop-account-bar-name"]')?.textContent,
    ).toContain('Invitado');

    (
      elementOf(fixture).querySelector(
        '[data-testid="shop-account-bar-signout"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(store.clear).toHaveBeenCalled();
    expect(
      elementOf(fixture).querySelector('[data-testid="shop-account-bar-signin"]'),
    ).not.toBeNull();
  });

  it('explains a failed start and forgets the return path', async () => {
    const store = barStore();
    await setup(store, () => Promise.reject(new OAuthFlowError('oauth_unavailable')));

    const fixture = TestBed.createComponent(ShopAccountBarComponent);
    fixture.detectChanges();

    (
      elementOf(fixture).querySelector(
        '[data-testid="shop-account-bar-signin"]',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      elementOf(fixture).querySelector('[data-testid="shop-account-bar-error"]')?.textContent,
    ).toContain('No se pudo hablar');
    expect(readShopReturnTo()).toBeNull();
  });

  it('does not repeat itself on the account page', async () => {
    const store = barStore();
    await setup(store, () => Promise.resolve(), [{ path: 'cuenta', component: EmptyComponent }]);

    await TestBed.inject(Router).navigateByUrl('/cuenta');

    const fixture = TestBed.createComponent(ShopAccountBarComponent);
    fixture.detectChanges();

    expect(elementOf(fixture).querySelector('[data-testid="shop-account-bar-signin"]')).toBeNull();
  });
});
