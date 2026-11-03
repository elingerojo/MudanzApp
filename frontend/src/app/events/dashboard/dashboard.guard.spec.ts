import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  type UrlTree,
} from '@angular/router';

import { API_BASE_URL } from '../../api-base-url.token';
import { SessionStore } from '../../session/session.store';
import { requireEventAdmin } from './dashboard.guard';

/**
 * El guard del dashboard (ciclo 4c-2, decisión §37).
 *
 * Tres salidas y ninguna inventa el derecho: sin credencial, al canje; con `200`, entra; con `403` o
 * `404`, vuelve a `Capturados` con `denied=dashboard`. El `403` no se convierte en una pantalla vacía:
 * es la evidencia de la frontera.
 */
const DASHBOARD_URL = '/api/events/event-1/dashboard';

const ROUTE = {
  parent: { paramMap: convertToParamMap({ eventId: 'event-1' }) },
  paramMap: convertToParamMap({}),
} as unknown as ActivatedRouteSnapshot;

function isUrlTree(value: unknown): value is UrlTree {
  return typeof value === 'object' && value !== null && 'root' in value;
}

describe('requireEventAdmin', () => {
  let httpTesting: HttpTestingController;
  let hasSession = true;

  beforeEach(() => {
    hasSession = true;

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: SessionStore, useValue: { hasSession: () => hasSession } },
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function run(): Promise<boolean | UrlTree> {
    return TestBed.runInInjectionContext(
      () => requireEventAdmin(ROUTE, {} as never) as Promise<boolean | UrlTree>,
    );
  }

  it('sends a device with no credential to the redemption screen', async () => {
    hasSession = false;

    const result = await run();

    expect(isUrlTree(result) && result.toString()).toBe('/invitacion');
  });

  it('lets the administrator through once the border says so', async () => {
    const result = run();
    httpTesting.expectOne(DASHBOARD_URL).flush({ administrator: null, devices: [] });

    await expect(result).resolves.toBe(true);
  });

  it('sends a forbidden session back to Capturados with the notice in the URL', async () => {
    const result = run();
    httpTesting
      .expectOne(DASHBOARD_URL)
      .flush({ error: 'forbidden' }, { status: 403, statusText: 'Forbidden' });

    const tree = await result;
    expect(isUrlTree(tree) && tree.toString()).toBe('/eventos/event-1/capturados?denied=dashboard');
  });

  it('treats an event the session cannot see the same way', async () => {
    const result = run();
    httpTesting
      .expectOne(DASHBOARD_URL)
      .flush({ error: 'not_found' }, { status: 404, statusText: 'Not Found' });

    const tree = await result;
    expect(isUrlTree(tree) && tree.toString()).toBe('/eventos/event-1/capturados?denied=dashboard');
  });
});
