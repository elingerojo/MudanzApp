import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CurrentIdentity, EventSummary, IssuedSession } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { SessionStore } from './session.store';

const STORAGE_KEY = 'mudanzapp.session';
const EVENT_STORAGE_KEY = 'mudanzapp.event';
const IDENTITY_URL = '/api/auth/session';

function issuedSession(token: string): IssuedSession {
  return { sessionToken: token, scope: 'app', user: null, event: null };
}

function event(id: string, role: EventSummary['role'] = 'member'): EventSummary {
  return {
    id,
    publicSlug: `${id}-slug`,
    originCity: 'Bogotá',
    destinationCity: 'Ciudad de México',
    currency: 'MXN',
    state: 'open',
    role,
    onboardingLevel: 0,
  };
}

function identityWith(events: readonly EventSummary[]): CurrentIdentity {
  return {
    user: { id: 'user-1', displayName: 'Ana', isAdmin: false },
    session: { id: 'session-1', scope: 'app' },
    events,
  };
}

/** Un turno de macro-tarea: deja resolver la lectura de identidad de `httpResource`. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * La sesión del dispositivo: una sola fuente y tres transiciones. La identidad que viaja al backend
 * se prueba en `auth.interceptor.spec.ts`, donde el `Bearer` es observable.
 *
 * Desde D15 el evento activo también puede venir de un recordado en `localStorage`, siempre que la
 * sesión lo siga publicando en `events()`.
 */
describe('SessionStore', () => {
  let store: SessionStore;
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
    store = TestBed.inject(SessionStore);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
    // Una prueba que no mira la lectura de identidad no debe dejarla pendiente.
    httpTesting.match(() => true).forEach((request) => request.flush({}));
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

  it('clears the credential from memory and disk when signing out', () => {
    store.establish(issuedSession('fresh-token'));

    store.clear();

    expect(store.hasSession()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps the remembered event when the session is cleared', () => {
    localStorage.setItem(EVENT_STORAGE_KEY, 'event-b');

    store.clear();

    expect(localStorage.getItem(EVENT_STORAGE_KEY)).toBe('event-b');
  });

  it('raises the onboarding level of the active event and rereads the identity', async () => {
    store.establish(issuedSession('fresh-token'));
    TestBed.tick();
    httpTesting.expectOne(IDENTITY_URL).flush(identityWith([event('event-a')]));
    await tick();

    const raised = store.raiseOnboardingLevel();
    const patch = httpTesting.expectOne('/api/events/event-a/onboarding-level');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ level: 1 });
    patch.flush({ level: 1 });
    await expect(raised).resolves.toBe(true);

    TestBed.tick();
    httpTesting
      .expectOne(IDENTITY_URL)
      .flush(identityWith([{ ...event('event-a'), onboardingLevel: 1 }]));
    await tick();

    expect(store.activeEvent()?.onboardingLevel).toBe(1);
  });

  it('does not write when the event is already at the highest level', async () => {
    store.establish(issuedSession('fresh-token'));
    TestBed.tick();
    httpTesting
      .expectOne(IDENTITY_URL)
      .flush(identityWith([{ ...event('event-a'), onboardingLevel: 1 }]));
    await tick();

    await expect(store.raiseOnboardingLevel()).resolves.toBe(false);
    httpTesting.expectNone('/api/events/event-a/onboarding-level');
  });

  it('finds the event the session can see', () => {
    store.establish(issuedSession('fresh-token'));

    // Sin identidad resuelta la lista está vacía: el store no inventa eventos.
    expect(store.eventById('event-1')).toBeNull();
    expect(store.events()).toEqual([]);
  });

  it('has no active event until the identity resolves', () => {
    store.establish(issuedSession('fresh-token'));

    expect(store.activeEvent()).toBeNull();
    expect(store.activeEventId()).toBeNull();
  });

  it('keeps the only membership active without asking the account to choose', async () => {
    store.establish(issuedSession('fresh-token'));
    TestBed.tick();
    httpTesting.expectOne(IDENTITY_URL).flush(identityWith([event('event-1')]));
    await tick();

    expect(store.activeEventId()).toBe('event-1');
    expect(store.requiresEventChoice()).toBe(false);
  });

  it('does not pick a membership on its own when the account has two', async () => {
    store.establish(issuedSession('fresh-token'));
    TestBed.tick();
    httpTesting.expectOne(IDENTITY_URL).flush(identityWith([event('event-a'), event('event-b')]));
    await tick();

    expect(store.activeEvent()).toBeNull();
    expect(store.activeEventId()).toBeNull();
    expect(store.requiresEventChoice()).toBe(true);
  });

  it('restores the remembered event when the session still reaches it', async () => {
    localStorage.setItem(STORAGE_KEY, 'stored-token');
    localStorage.setItem(EVENT_STORAGE_KEY, 'event-b');

    store.restore();
    TestBed.tick();
    httpTesting.expectOne(IDENTITY_URL).flush(identityWith([event('event-a'), event('event-b')]));
    await tick();

    expect(store.activeEventId()).toBe('event-b');
    expect(store.activeEvent()?.role).toBe('member');
    expect(store.requiresEventChoice()).toBe(false);
  });

  it('ignores a remembered event the session no longer reaches', async () => {
    localStorage.setItem(STORAGE_KEY, 'stored-token');
    localStorage.setItem(EVENT_STORAGE_KEY, 'event-retired');

    store.restore();
    TestBed.tick();
    httpTesting.expectOne(IDENTITY_URL).flush(identityWith([event('event-a'), event('event-b')]));
    await tick();

    expect(store.activeEvent()).toBeNull();
    expect(store.requiresEventChoice()).toBe(true);
  });

  it('falls back to the only membership when the remembered event is stale', async () => {
    localStorage.setItem(STORAGE_KEY, 'stored-token');
    localStorage.setItem(EVENT_STORAGE_KEY, 'event-retired');

    store.restore();
    TestBed.tick();
    httpTesting.expectOne(IDENTITY_URL).flush(identityWith([event('event-1')]));
    await tick();

    expect(store.activeEventId()).toBe('event-1');
    expect(store.requiresEventChoice()).toBe(false);
  });

  it('ignores an empty remembered event', async () => {
    localStorage.setItem(EVENT_STORAGE_KEY, '');
    store.establish(issuedSession('fresh-token'));
    TestBed.tick();
    httpTesting.expectOne(IDENTITY_URL).flush(identityWith([event('event-a'), event('event-b')]));
    await tick();

    expect(store.activeEvent()).toBeNull();
    expect(store.requiresEventChoice()).toBe(true);
  });

  it('makes the chosen membership active, clears the pending choice and remembers it on disk', async () => {
    store.establish(issuedSession('fresh-token'));
    TestBed.tick();
    httpTesting.expectOne(IDENTITY_URL).flush(identityWith([event('event-a'), event('event-b')]));
    await tick();

    expect(store.selectEvent('event-b')).toBe(true);

    expect(store.activeEventId()).toBe('event-b');
    expect(store.activeEvent()?.role).toBe('member');
    expect(store.requiresEventChoice()).toBe(false);
    expect(localStorage.getItem(EVENT_STORAGE_KEY)).toBe('event-b');
  });

  it('refuses a choice the session cannot see and does not remember it', async () => {
    store.establish(issuedSession('fresh-token'));
    TestBed.tick();
    httpTesting.expectOne(IDENTITY_URL).flush(identityWith([event('event-a'), event('event-b')]));
    await tick();

    expect(store.selectEvent('event-elsewhere')).toBe(false);

    expect(store.activeEvent()).toBeNull();
    expect(store.requiresEventChoice()).toBe(true);
    expect(localStorage.getItem(EVENT_STORAGE_KEY)).toBeNull();
  });

  it('replaces the remembered event with a new valid choice', async () => {
    localStorage.setItem(STORAGE_KEY, 'stored-token');
    localStorage.setItem(EVENT_STORAGE_KEY, 'event-a');

    store.restore();
    TestBed.tick();
    httpTesting.expectOne(IDENTITY_URL).flush(identityWith([event('event-a'), event('event-b')]));
    await tick();

    expect(store.activeEventId()).toBe('event-a');
    expect(store.selectEvent('event-b')).toBe(true);
    expect(store.activeEventId()).toBe('event-b');
    expect(localStorage.getItem(EVENT_STORAGE_KEY)).toBe('event-b');
  });
});
