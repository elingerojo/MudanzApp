import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, type UrlTree } from '@angular/router';
import { firstValueFrom, isObservable, type Observable } from 'rxjs';

import { API_BASE_URL } from '../../api-base-url.token';
import { SessionStore } from '../../session/session.store';
import { requireEventAdmin } from './dashboard.guard';

/**
 * El guard de la administración del evento (ciclos 4c-2 y el diagnóstico del borde, decisión §37;
 * cortes D8 y D10).
 *
 * Una salida por hecho y ninguna inventa el derecho: sin credencial, al canje; con `200`, entra; con
 * un fallo, vuelve a `Cuenta` con `denied=dashboard` **y la familia del fallo**. Desde D8 el evento
 * sale de la sesión, así que la guarda espera a que la identidad deje de cargar antes de decidir;
 * sin evento, el camino es la portada.
 */
const DASHBOARD_URL = '/api/events/event-1/dashboard';

type IdentityStatus = 'idle' | 'loading' | 'reloading' | 'error' | 'resolved';

function isUrlTree(value: unknown): value is UrlTree {
  return typeof value === 'object' && value !== null && 'root' in value;
}

describe('requireEventAdmin', () => {
  let httpTesting: HttpTestingController;
  let hasSession = true;
  const identityStatus = signal<IdentityStatus>('resolved');
  const activeEventId = signal<string | null>('event-1');
  const requiresEventChoice = signal(false);

  beforeEach(() => {
    hasSession = true;
    identityStatus.set('resolved');
    activeEventId.set('event-1');
    requiresEventChoice.set(false);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api' },
        {
          provide: SessionStore,
          useValue: {
            hasSession: () => hasSession,
            identityStatus,
            activeEventId,
            requiresEventChoice,
          },
        },
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  /**
   * La guarda devuelve un `UrlTree` cuando la credencial falta y un `Observable` cuando tiene que
   * esperar a la identidad. La prueba acepta las dos formas.
   */
  function start(): boolean | UrlTree | Observable<boolean | UrlTree> {
    return TestBed.runInInjectionContext(() => requireEventAdmin({} as never, {} as never)) as
      boolean | UrlTree | Observable<boolean | UrlTree>;
  }

  /** Deja correr el efecto que publica el estado de identidad y aplica la lectura indicada. */
  async function decide(read: () => void): Promise<boolean | UrlTree> {
    const outcome = start();
    if (!isObservable(outcome)) {
      return outcome;
    }

    const result = firstValueFrom(outcome);
    TestBed.tick();
    read();
    return result;
  }

  it('sends a device with no credential to the redemption screen', async () => {
    hasSession = false;

    const result = await decide(() => undefined);

    expect(isUrlTree(result) && result.toString()).toBe('/invitacion');
  });

  it('waits for the identity before asking the border', async () => {
    identityStatus.set('loading');

    const result = firstValueFrom(start() as Observable<boolean | UrlTree>);
    TestBed.tick();
    expect(httpTesting.match(DASHBOARD_URL)).toHaveLength(0);

    identityStatus.set('resolved');
    TestBed.tick();
    httpTesting.expectOne(DASHBOARD_URL).flush({ administrator: null, devices: [] });

    await expect(result).resolves.toBe(true);
  });

  it('lets the administrator through once the border says so', async () => {
    const result = decide(() => {
      httpTesting.expectOne(DASHBOARD_URL).flush({ administrator: null, devices: [] });
    });

    await expect(result).resolves.toBe(true);
  });

  it('sends a session with no event to the public home', async () => {
    activeEventId.set(null);

    const result = await decide(() => undefined);

    expect(isUrlTree(result) && result.toString()).toBe('/');
  });

  it('sends an account with several moves and no choice to the selector', async () => {
    activeEventId.set(null);
    requiresEventChoice.set(true);

    const result = await decide(() => undefined);

    expect(isUrlTree(result) && result.toString()).toBe('/eventos');
  });

  it('sends a forbidden session back to Cuenta with the refusal in the URL', async () => {
    const result = decide(() => {
      httpTesting
        .expectOne(DASHBOARD_URL)
        .flush({ error: 'forbidden' }, { status: 403, statusText: 'Forbidden' });
    });

    const tree = await result;
    expect(isUrlTree(tree) && tree.toString()).toBe('/cuenta?denied=dashboard&reason=forbidden');
  });

  it('tells an event the session cannot see apart from a refusal', async () => {
    const result = decide(() => {
      httpTesting
        .expectOne(DASHBOARD_URL)
        .flush({ error: 'not_found' }, { status: 404, statusText: 'Not Found' });
    });

    const tree = await result;
    expect(isUrlTree(tree) && tree.toString()).toBe('/cuenta?denied=dashboard&reason=not_found');
  });

  it('does not pass a failed read off as a refusal', async () => {
    const result = decide(() => {
      httpTesting
        .expectOne(DASHBOARD_URL)
        .flush({ error: 'internal_error' }, { status: 500, statusText: 'Server Error' });
    });

    const tree = await result;
    expect(isUrlTree(tree) && tree.toString()).toBe('/cuenta?denied=dashboard&reason=unavailable');
  });

  it('treats a network failure as an unavailable read, not as a refusal', async () => {
    const result = decide(() => {
      httpTesting.expectOne(DASHBOARD_URL).error(new ProgressEvent('error'));
    });

    const tree = await result;
    expect(isUrlTree(tree) && tree.toString()).toBe('/cuenta?denied=dashboard&reason=unavailable');
  });
});
