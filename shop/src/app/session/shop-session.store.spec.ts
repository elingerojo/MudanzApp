import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { IssuedSession, ShopIdentity } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { ShopSessionStore } from './shop-session.store';

const STORAGE_KEY = 'mudanzapp.shop.session';
const IDENTITY_URL = '/api/auth/shop/session';
const PROFILE_URL = '/api/auth/shop/profile';

const USER = { id: 'user-shop', displayName: 'Invitado', isAdmin: false };

const IDENTITY: ShopIdentity = {
  user: USER,
  session: { id: 'session-shop', scope: 'shop' },
};

const ISSUED: IssuedSession = {
  sessionToken: 'shop-token',
  scope: 'shop',
  user: USER,
  event: null,
};

/** Un turno de macro-tarea: deja correr la cadena de promesas del recurso. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * La sesión de la tienda (ciclo 4d): una sola fuente, su propia clave y una lectura que se rehace tras
 * el acto de perfil. La identidad que viaja al backend se prueba aquí mismo con la petición esperada.
 */
describe('ShopSessionStore', () => {
  let store: ShopSessionStore;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ShopSessionStore);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('starts without a session and without a credential in memory', () => {
    expect(store.hasSession()).toBe(false);
    expect(store.token()).toBeNull();
  });

  it('restores its own credential written by a previous visit', () => {
    localStorage.setItem(STORAGE_KEY, 'stored-token');

    store.restore();

    expect(store.hasSession()).toBe(true);
    expect(store.token()).toBe('stored-token');
  });

  it('establishes the session, stores it under its own key and reads the identity', async () => {
    store.establish(ISSUED);
    await tick();

    httpTesting.expectOne(IDENTITY_URL).flush(IDENTITY);
    await tick();

    expect(store.token()).toBe('shop-token');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('shop-token');
    expect(store.user()).toEqual(USER);
  });

  it('clears memory and disk when signing out', () => {
    store.establish(ISSUED);

    store.clear();

    expect(store.hasSession()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    httpTesting.expectNone(IDENTITY_URL);
  });

  it('writes the optional name and re-reads the identity instead of patching it by hand', async () => {
    store.establish(ISSUED);
    await tick();
    httpTesting.expectOne(IDENTITY_URL).flush(IDENTITY);
    await tick();

    const saving = store.updateDisplayName('Compradora');
    const patch = httpTesting.expectOne({ method: 'PATCH', url: PROFILE_URL });
    expect(patch.request.body).toEqual({ displayName: 'Compradora' });
    patch.flush({ user: { ...USER, displayName: 'Compradora' } });

    await tick();
    httpTesting.expectOne(IDENTITY_URL).flush({
      ...IDENTITY,
      user: { ...USER, displayName: 'Compradora' },
    });
    await saving;

    expect(store.user()?.displayName).toBe('Compradora');
  });
});
