import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { IssuedSession } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { authInterceptor } from './auth.interceptor';
import { SessionStore } from './session.store';

function issuedSession(token: string): IssuedSession {
  return { sessionToken: token, scope: 'app', user: null, event: null };
}

/**
 * El interceptor es el único lugar donde la credencial entra en una petición. Dos hechos: sin
 * sesión no se adjunta nada, y una petición a otro origen nunca la lleva.
 */
describe('authInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let store: SessionStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    store = TestBed.inject(SessionStore);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('sends no Authorization header without a session', () => {
    http.get('/api/health').subscribe();

    const request = httpTesting.expectOne('/api/health');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ status: 'ok', database: 'ok' });
  });

  it('attaches the device credential to the own API', () => {
    store.establish(issuedSession('device-token'));

    http.get('/api/events/event-1/items').subscribe();

    const request = httpTesting.expectOne('/api/events/event-1/items');
    expect(request.request.headers.get('Authorization')).toBe('Bearer device-token');
    request.flush({ items: [] });
  });

  it('leaves a request that already carries its own Authorization untouched', () => {
    store.establish(issuedSession('device-token'));

    http
      .get('/api/admin/events', { headers: { Authorization: 'Bearer platform-token' } })
      .subscribe();

    const request = httpTesting.expectOne('/api/admin/events');
    expect(request.request.headers.get('Authorization')).toBe('Bearer platform-token');
    request.flush({ events: [], nextCursor: null });
  });

  it('never attaches the credential to another origin', () => {
    store.establish(issuedSession('device-token'));

    http.get('https://example.com/ping').subscribe();

    const request = httpTesting.expectOne('https://example.com/ping');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });
});
