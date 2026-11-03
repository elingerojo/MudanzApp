import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { IdentityUser, ItemSummary, SessionSummary } from '@mudanzapp/shared';

import { API_BASE_URL } from '../../api-base-url.token';
import { SessionStore } from '../../session/session.store';
import { SHOP_BASE_URL } from '../../shop-base-url.token';
import { EventItemsStore } from '../event-items.store';
import { DashboardComponent } from './dashboard.component';
import { DashboardStore } from './dashboard.store';

/**
 * El panel del event-administrator (ciclo 4c-2, `plan-ciclo-4c-2` §8).
 *
 * Se prueba lo que la pantalla **publica**, no lo que deduce: quién administra llega del borde, el
 * contador sale del recurso compartido de artículos y la lista de acceso es solo de co-dispositivos.
 * También se prueba lo que no hace: no lista invitaciones ni borra capturas.
 */
const DASHBOARD_URL = '/api/events/event-1/dashboard';
const DELETE_URL = '/api/events/event-1/sessions/device-1';
const ITEMS_URL = '/api/events/event-1/items';

const EVENT = {
  id: 'event-1',
  publicSlug: 'bogota-ciudad-de-mexico-3f9a2c',
  originCity: 'Bogotá',
  destinationCity: 'Ciudad de México',
  currency: 'MXN',
  state: 'open',
  role: 'member' as const,
};

const ADMINISTRATOR: IdentityUser = { id: 'user-king', displayName: 'Ana', isAdmin: false };

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

const ITEM: ItemSummary = {
  id: 'item-1',
  eventId: 'event-1',
  title: 'Mesa de roble',
  note: null,
  widthCm: null,
  heightCm: null,
  depthCm: null,
  weightKg: null,
  priceCents: null,
  soldAt: null,
  photo: null,
  publishedSlug: null,
  createdAt: '2026-10-31T00:00:00.000Z',
};

function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('DashboardComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        EventItemsStore,
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: SHOP_BASE_URL, useValue: 'http://shop.test' },
        { provide: SessionStore, useValue: { eventById: () => EVENT } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ eventId: 'event-1' }) } },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  async function render(
    devices: readonly SessionSummary[],
    administrator: IdentityUser | null,
  ): Promise<Awaited<ReturnType<typeof build>>> {
    return build(devices, administrator);
  }

  async function build(devices: readonly SessionSummary[], administrator: IdentityUser | null) {
    const store = TestBed.inject(DashboardStore);
    const loading = store.load('event-1');
    httpTesting.expectOne(DASHBOARD_URL).flush({ administrator, devices });
    await loading;

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    for (const request of httpTesting.match((candidate) => candidate.url === ITEMS_URL)) {
      request.flush({ items: [ITEM] });
    }

    await tick();
    fixture.detectChanges();
    return fixture;
  }

  type Fixture = Awaited<ReturnType<typeof build>>;

  function query(fixture: Fixture, testId: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
  }

  function text(fixture: Fixture): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('publishes who administers, the public link, the count and the co-devices', async () => {
    const fixture = await render([DEVICE], ADMINISTRATOR);

    expect(query(fixture, 'dashboard-administrator')?.textContent).toContain('Ana');
    expect(query(fixture, 'dashboard-public-link')?.textContent).toContain(
      'http://shop.test/evento/bogota-ciudad-de-mexico-3f9a2c',
    );
    expect(query(fixture, 'dashboard-counts')?.textContent).toContain('Capturados: 1');
    expect(query(fixture, 'dashboard-access')).not.toBeNull();
    expect(query(fixture, 'access-device-revoke')).not.toBeNull();
    expect(query(fixture, 'access-device-revoke-confirm')).toBeNull();
    expect(query(fixture, 'access-empty')).toBeNull();
  });

  it('says the event has no administrator instead of inventing one', async () => {
    const fixture = await render([], null);

    expect(query(fixture, 'dashboard-unclaimed')).not.toBeNull();
    expect(query(fixture, 'dashboard-administrator')).toBeNull();
    expect(query(fixture, 'access-empty')).not.toBeNull();
  });

  it('shows a revoked device as evidence and offers no act over it', async () => {
    const fixture = await render([REVOKED], ADMINISTRATOR);

    expect(query(fixture, 'access-device-state')?.textContent).toContain('sin acceso');
    expect(query(fixture, 'access-device-revoke')).toBeNull();
  });

  it('asks for confirmation in two touches and reloads after revoking', async () => {
    const fixture = await render([DEVICE], ADMINISTRATOR);

    query(fixture, 'access-device-revoke')?.click();
    fixture.detectChanges();
    expect(query(fixture, 'access-device-revoke-confirm')).not.toBeNull();

    query(fixture, 'access-device-revoke-confirm')?.click();
    httpTesting.expectOne(DELETE_URL).flush(null, { status: 204, statusText: 'No Content' });

    await tick();
    httpTesting
      .expectOne(DASHBOARD_URL)
      .flush({ administrator: ADMINISTRATOR, devices: [REVOKED] });

    await tick();
    fixture.detectChanges();

    expect(query(fixture, 'access-device-revoke')).toBeNull();
    expect(query(fixture, 'access-device-state')?.textContent).toContain('sin acceso');
    expect(text(fixture)).not.toContain('Cancelar enlace');
  });
});
