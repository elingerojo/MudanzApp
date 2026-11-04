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
 * El guard del dashboard (ciclos 4c-2 y el diagnóstico del borde, decisión §37).
 *
 * Una salida por hecho y ninguna inventa el derecho: sin credencial, al canje; con `200`, entra; con
 * un fallo, vuelve a `Capturados` con `denied=dashboard` **y la familia del fallo**, que desde el
 * diagnóstico del borde (2026-11-04) distingue «el borde dijo que no» de «no lo alcanzo» de «la
 * lectura falló». El `403` no se convierte en una pantalla vacía: es la evidencia de la frontera.
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

  it('sends a forbidden session back to Capturados with the refusal in the URL', async () => {
    const result = run();
    httpTesting
      .expectOne(DASHBOARD_URL)
      .flush({ error: 'forbidden' }, { status: 403, statusText: 'Forbidden' });

    const tree = await result;
    expect(isUrlTree(tree) && tree.toString()).toBe(
      '/eventos/event-1/capturados?denied=dashboard&reason=forbidden',
    );
  });

  it('tells an event the session cannot see apart from a refusal', async () => {
    const result = run();
    httpTesting
      .expectOne(DASHBOARD_URL)
      .flush({ error: 'not_found' }, { status: 404, statusText: 'Not Found' });

    const tree = await result;
    expect(isUrlTree(tree) && tree.toString()).toBe(
      '/eventos/event-1/capturados?denied=dashboard&reason=not_found',
    );
  });

  it('does not pass a failed read off as a refusal', async () => {
    const result = run();
    httpTesting
      .expectOne(DASHBOARD_URL)
      .flush({ error: 'internal_error' }, { status: 500, statusText: 'Server Error' });

    const tree = await result;
    expect(isUrlTree(tree) && tree.toString()).toBe(
      '/eventos/event-1/capturados?denied=dashboard&reason=unavailable',
    );
  });

  it('treats a network failure as an unavailable read, not as a refusal', async () => {
    const result = run();
    httpTesting.expectOne(DASHBOARD_URL).error(new ProgressEvent('error'));

    const tree = await result;
    expect(isUrlTree(tree) && tree.toString()).toBe(
      '/eventos/event-1/capturados?denied=dashboard&reason=unavailable',
    );
  });
});
