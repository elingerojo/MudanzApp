import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { OAuthFlowError } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { SHOP_OAUTH_FLOW } from './shop-oauth-flow';
import { ShopOAuthCallbackComponent } from './shop-oauth-callback.component';
import { clearShopReturnTo, saveShopReturnTo } from './shop-return-to';
import { ShopSessionStore } from './shop-session.store';

const ISSUED = {
  sessionToken: 'shop-token',
  scope: 'shop',
  user: { id: 'user-shop', displayName: 'Invitado', isAdmin: false },
  event: null,
};

function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * La vuelta del proveedor en la tienda (ciclo 4d): entrega el token al alta o regreso, establece la
 * sesión y navega a la página que inició el flujo —`/cuenta` si no hay una guardada—; un fallo se
 * traduce a una frase y no pide nada.
 */
describe('ShopOAuthCallbackComponent', () => {
  let httpTesting: HttpTestingController;
  let establish: ReturnType<typeof vi.fn>;

  afterEach(() => {
    clearShopReturnTo();
  });

  async function setup(complete: () => Promise<{ readonly idToken: string }>) {
    establish = vi.fn();

    await TestBed.configureTestingModule({
      imports: [ShopOAuthCallbackComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api' },
        {
          provide: SHOP_OAUTH_FLOW,
          useValue: { begin: vi.fn(), complete: vi.fn(complete) },
        },
        { provide: ShopSessionStore, useValue: { establish } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ code: 'codigo', state: 'estado' }),
            },
          },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  }

  it('exchanges the token for a shop session and goes to the account by default', async () => {
    await setup(() => Promise.resolve({ idToken: 'id-token' }));

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(ShopOAuthCallbackComponent);
    fixture.detectChanges();
    await tick();

    httpTesting.expectOne('/api/auth/shop/sessions').flush(ISSUED);
    await fixture.whenStable();

    expect(establish).toHaveBeenCalledWith(ISSUED);
    expect(navigate).toHaveBeenCalledWith('/cuenta', { replaceUrl: true });
  });

  it('returns to the public page that started the flow', async () => {
    saveShopReturnTo('/evento/bogota-ciudad-de-mexico-3f9a2c');
    await setup(() => Promise.resolve({ idToken: 'id-token' }));

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(ShopOAuthCallbackComponent);
    fixture.detectChanges();
    await tick();

    httpTesting.expectOne('/api/auth/shop/sessions').flush(ISSUED);
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith('/evento/bogota-ciudad-de-mexico-3f9a2c', {
      replaceUrl: true,
    });
  });

  it('explains a rejected return without asking the backend', async () => {
    await setup(() => Promise.reject(new OAuthFlowError('oauth_state_mismatch')));

    const fixture = TestBed.createComponent(ShopOAuthCallbackComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await tick();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="shop-oauth-error"]')?.textContent).toContain(
      'vuelta del proveedor',
    );
    httpTesting.expectNone('/api/auth/shop/sessions');
    expect(establish).not.toHaveBeenCalled();
  });
});
