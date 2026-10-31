import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { IssuedSession } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { SessionStore } from './session.store';

const STORAGE_KEY = 'mudanzapp.session';

function issuedSession(token: string): IssuedSession {
  return { sessionToken: token, scope: 'app', user: null, event: null };
}

/**
 * La sesión del dispositivo: una sola fuente y tres transiciones. La identidad que viaja al backend
 * se prueba en `auth.interceptor.spec.ts`, donde el `Bearer` es observable.
 */
describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
    store = TestBed.inject(SessionStore);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts without a session and without a credential in memory', () => {
    expect(store.hasSession()).toBe(false);
    expect(store.token()).toBeNull();
  });

  it('restores the credential written by a previous visit', () => {
    localStorage.setItem(STORAGE_KEY, 'stored-token');

    store.restore();

    expect(store.hasSession()).toBe(true);
    expect(store.token()).toBe('stored-token');
  });

  it('ignores an empty stored credential', () => {
    localStorage.setItem(STORAGE_KEY, '');

    store.restore();

    expect(store.hasSession()).toBe(false);
  });

  it('establishes the session in memory and on disk', () => {
    store.establish(issuedSession('fresh-token'));

    expect(store.token()).toBe('fresh-token');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('fresh-token');
  });

  it('clears both memory and disk when signing out', () => {
    store.establish(issuedSession('fresh-token'));

    store.clear();

    expect(store.hasSession()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('finds the event the session can see', () => {
    store.establish(issuedSession('fresh-token'));

    // Sin identidad resuelta la lista está vacía: el store no inventa eventos.
    expect(store.eventById('event-1')).toBeNull();
    expect(store.events()).toEqual([]);
  });
});
