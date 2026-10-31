import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import type { IssuedSession } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { requireSession } from './session.guard';
import { SessionStore } from './session.store';

function issuedSession(token: string): IssuedSession {
  return { sessionToken: token, scope: 'app', user: null, event: null };
}

/** El router se reemplaza por un doble: el guard solo devuelve el árbol de navegación. */
describe('requireSession', () => {
  let store: SessionStore;
  let requested: unknown[] | null;

  beforeEach(() => {
    localStorage.clear();
    requested = null;

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        {
          provide: Router,
          useValue: {
            createUrlTree: (commands: unknown[]): UrlTree => {
              requested = commands;
              return new UrlTree();
            },
          },
        },
      ],
    });

    store = TestBed.inject(SessionStore);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('sends a device without a session to the redeem screen', () => {
    const result = TestBed.runInInjectionContext(() => requireSession({} as never, {} as never));

    expect(requested).toEqual(['/invitacion']);
    expect(result).not.toBe(true);
  });

  it('lets a device with a session through', () => {
    store.establish(issuedSession('device-token'));

    const result = TestBed.runInInjectionContext(() => requireSession({} as never, {} as never));

    expect(result).toBe(true);
    expect(requested).toBeNull();
  });
});
