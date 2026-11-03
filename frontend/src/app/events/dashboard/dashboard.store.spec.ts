import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { InvitationSummary, SessionSummary } from '@mudanzapp/shared';

import { API_BASE_URL } from '../../api-base-url.token';
import { DashboardStore } from './dashboard.store';

/**
 * El store del panel (ciclos 4c-2 y 4c-3): **una** lectura por evento, compartida por el guard y la
 * pantalla.
 *
 * Las afirmaciones que importan: la segunda visita no repite la petición, un fallo **no** se recuerda
 * —un evento que se reclama desde la misma sesión debe poder abrir el panel sin recargar—, y los dos
 * actos rehacen la lectura en vez de parchear la copia local.
 */
const DASHBOARD_URL = '/api/events/event-1/dashboard';
const REVOKE_URL = '/api/events/event-1/sessions/device-1';
const CANCEL_URL = '/api/events/event-1/invitations/invitation-1';

const ADMINISTRATOR = { id: 'user-king', displayName: 'Ana', isAdmin: false };

const DEVICE: SessionSummary = {
  id: 'device-1',
  userId: null,
  userDisplayName: null,
  scope: 'app',
  deviceLabel: 'Teléfono',
  createdAt: '2026-11-01T10:00:00.000Z',
  lastSeenAt: '2026-11-02T10:00:00.000Z',
  revokedAt: null,
};

const REVOKED: SessionSummary = { ...DEVICE, revokedAt: '2026-11-03T10:00:00.000Z' };

const INVITATION: InvitationSummary = {
  id: 'invitation-1',
  createdAt: '2026-11-01T09:00:00.000Z',
  expiresAt: '2026-11-04T09:00:00.000Z',
  useCount: 2,
  revokedAt: null,
};

const CANCELLED: InvitationSummary = { ...INVITATION, revokedAt: '2026-11-03T10:00:00.000Z' };

/** Un turno de macro-tarea: deja correr la cadena de promesas entre dos peticiones encadenadas. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('DashboardStore', () => {
  let httpTesting: HttpTestingController;
  let store: DashboardStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    store = TestBed.inject(DashboardStore);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('reads the dashboard once per event and remembers the answer', async () => {
    const first = store.load('event-1');
    httpTesting.expectOne(DASHBOARD_URL).flush({
      administrator: ADMINISTRATOR,
      devices: [DEVICE],
      invitations: [INVITATION],
    });
    await expect(first).resolves.toMatchObject({ ok: true });

    await expect(store.load('event-1')).resolves.toMatchObject({ ok: true });
    httpTesting.expectNone(DASHBOARD_URL);

    expect(store.administrator()).toEqual(ADMINISTRATOR);
    expect(store.devices()).toHaveLength(1);
    expect(store.invitations()).toEqual([INVITATION]);
  });

  it('does not cache a failure, so a claim can open the panel without reloading', async () => {
    const denied = store.load('event-1');
    httpTesting
      .expectOne(DASHBOARD_URL)
      .flush({ error: 'forbidden' }, { status: 403, statusText: 'Forbidden' });

    await expect(denied).resolves.toEqual({ ok: false, code: 'forbidden' });
    expect(store.dashboard()).toBeNull();

    const retried = store.load('event-1');
    httpTesting
      .expectOne(DASHBOARD_URL)
      .flush({ administrator: null, devices: [], invitations: [] });
    await expect(retried).resolves.toMatchObject({ ok: true });
    expect(store.unclaimed()).toBe(true);
  });

  it('revokes a device and reloads instead of patching the list by hand', async () => {
    const loaded = store.load('event-1');
    httpTesting.expectOne(DASHBOARD_URL).flush({
      administrator: ADMINISTRATOR,
      devices: [DEVICE],
      invitations: [],
    });
    await loaded;

    const revoking = store.revoke('event-1', DEVICE);
    httpTesting.expectOne(REVOKE_URL).flush(null, { status: 204, statusText: 'No Content' });

    await tick();
    httpTesting.expectOne(DASHBOARD_URL).flush({
      administrator: ADMINISTRATOR,
      devices: [REVOKED],
      invitations: [],
    });
    await revoking;

    expect(store.revokingId()).toBeNull();
    expect(store.devices()).toEqual([REVOKED]);
    expect(store.accessFailure()).toBeNull();
  });

  it('translates a forbidden revoke into its own phrase and keeps the reading', async () => {
    const loaded = store.load('event-1');
    httpTesting.expectOne(DASHBOARD_URL).flush({
      administrator: ADMINISTRATOR,
      devices: [DEVICE],
      invitations: [],
    });
    await loaded;

    const revoking = store.revoke('event-1', DEVICE);
    httpTesting
      .expectOne(REVOKE_URL)
      .flush({ error: 'forbidden' }, { status: 403, statusText: 'Forbidden' });
    await revoking;

    expect(store.accessFailure()).toBe('No puedes retirar el acceso de esa sesión.');
    expect(store.devices()).toEqual([DEVICE]);
  });

  it('cancels an invitation and reloads, because the link state belongs to the border', async () => {
    const loaded = store.load('event-1');
    httpTesting.expectOne(DASHBOARD_URL).flush({
      administrator: ADMINISTRATOR,
      devices: [DEVICE],
      invitations: [INVITATION],
    });
    await loaded;

    const cancelling = store.cancel('event-1', INVITATION);
    httpTesting.expectOne(CANCEL_URL).flush(null, { status: 204, statusText: 'No Content' });

    await tick();
    httpTesting.expectOne(DASHBOARD_URL).flush({
      administrator: ADMINISTRATOR,
      devices: [DEVICE],
      invitations: [CANCELLED],
    });
    await cancelling;

    expect(store.cancellingId()).toBeNull();
    expect(store.invitations()).toEqual([CANCELLED]);
    expect(store.accessFailure()).toBeNull();
  });

  it('translates a forbidden cancel into its own phrase and keeps the reading', async () => {
    const loaded = store.load('event-1');
    httpTesting.expectOne(DASHBOARD_URL).flush({
      administrator: ADMINISTRATOR,
      devices: [],
      invitations: [INVITATION],
    });
    await loaded;

    const cancelling = store.cancel('event-1', INVITATION);
    httpTesting
      .expectOne(CANCEL_URL)
      .flush({ error: 'forbidden' }, { status: 403, statusText: 'Forbidden' });
    await cancelling;

    expect(store.accessFailure()).toBe('No puedes cancelar un enlace de este evento.');
    expect(store.invitations()).toEqual([INVITATION]);
  });
});
