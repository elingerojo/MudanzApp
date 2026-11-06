import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  CartRequestSummary,
  IdentityUser,
  InvitationSummary,
  ItemSummary,
  SessionSummary,
} from '@mudanzapp/shared';

import { API_BASE_URL } from '../../api-base-url.token';
import { SessionStore } from '../../session/session.store';
import { SHOP_BASE_URL } from '../../shop-base-url.token';
import { EventItemsStore } from '../event-items.store';
import { DashboardComponent } from './dashboard.component';
import { DashboardStore } from './dashboard.store';

/**
 * El panel del event-administrator (ciclos 4c-2, 4c-3 y 4c-4).
 *
 * Se prueba lo que la pantalla **publica**, no lo que deduce: quién administra llega del borde, el
 * contador sale del recurso compartido de artículos, y las tres listas —co-dispositivos, enlaces y
 * capturas— son las del payload. También se prueba lo que no hace: no ofrece un acto sobre una fila ya
 * cancelada ni sobre una sesión ya des-invitada, y no borra un artículo vendido.
 */
const DASHBOARD_URL = '/api/events/event-1/dashboard';
const REVOKE_URL = '/api/events/event-1/sessions/device-1';
const CANCEL_URL = '/api/events/event-1/invitations/invitation-1';
const ITEMS_URL = '/api/events/event-1/items';
const ITEM_DELETE_URL = '/api/events/event-1/items/item-1';
const CONTACT_URL = '/api/events/event-1/contact';
const REQUESTS_URL = '/api/events/event-1/cart-requests';
const REQUEST_DISMISS_URL = '/api/events/event-1/cart-requests/request-1';

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

const INVITATION: InvitationSummary = {
  id: 'invitation-1',
  createdAt: '2026-11-01T09:00:00.000Z',
  expiresAt: '2026-11-04T09:00:00.000Z',
  useCount: 2,
  revokedAt: null,
  label: 'caja',
};

const CANCELLED: InvitationSummary = { ...INVITATION, revokedAt: '2026-11-03T10:00:00.000Z' };

const CART_REQUEST: CartRequestSummary = {
  id: 'request-1',
  reference: 'ab12cd34',
  buyerName: 'Compradora',
  itemCount: 1,
  items: [{ title: 'Mesa de roble', priceCents: 125_000 }],
  requestedAt: '2026-11-04T18:00:00.000Z',
  dismissedAt: null,
  cancelledAt: null,
};

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
  unpublishedAt: null,
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
        provideRouter([]),
        EventItemsStore,
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: SHOP_BASE_URL, useValue: 'http://shop.test' },
        {
          provide: SessionStore,
          useValue: {
            activeEventId: signal('event-1'),
            eventById: () => EVENT,
          },
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
    invitations: readonly InvitationSummary[] = [],
    items: readonly ItemSummary[] = [ITEM],
    requests: readonly CartRequestSummary[] = [],
    contactPhone: string | null = null,
  ): Promise<Awaited<ReturnType<typeof build>>> {
    return build(devices, administrator, invitations, items, requests, contactPhone);
  }

  async function build(
    devices: readonly SessionSummary[],
    administrator: IdentityUser | null,
    invitations: readonly InvitationSummary[] = [],
    items: readonly ItemSummary[] = [ITEM],
    requests: readonly CartRequestSummary[] = [],
    contactPhone: string | null = null,
  ) {
    const store = TestBed.inject(DashboardStore);
    const loading = store.load('event-1');
    httpTesting.expectOne(DASHBOARD_URL).flush({ administrator, devices, invitations });
    await loading;

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    await tick();
    fixture.detectChanges();

    for (const request of httpTesting.match((candidate) => candidate.url === ITEMS_URL)) {
      request.flush({ items });
    }

    // Desde el ciclo 4e el panel tiene dos lecturas propias: el WhatsApp del evento y sus solicitudes.
    for (const request of httpTesting.match(
      (candidate) => candidate.url === CONTACT_URL || candidate.url === REQUESTS_URL,
    )) {
      request.flush(request.request.url === CONTACT_URL ? { contactPhone } : { requests });
    }

    await tick();
    fixture.detectChanges();

    // El recurso compartido de artículos puede arrancar después del primer render: se drena también
    // esa lectura para que la verificación del final no dependa del orden de los efectos.
    for (const request of httpTesting.match((candidate) => candidate.url === ITEMS_URL)) {
      request.flush({ items });
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

  it('publishes who administers, the public link, the count, the co-devices and the links', async () => {
    const fixture = await render([DEVICE], ADMINISTRATOR, [INVITATION]);

    expect(query(fixture, 'dashboard-administrator')?.textContent).toContain('Ana');
    expect(query(fixture, 'dashboard-public-link')?.textContent).toContain(
      'http://shop.test/evento/bogota-ciudad-de-mexico-3f9a2c',
    );
    expect(query(fixture, 'dashboard-counts')?.textContent).toContain('Capturados: 1');
    expect(query(fixture, 'dashboard-access')).not.toBeNull();
    expect(query(fixture, 'access-device-revoke')).not.toBeNull();
    expect(query(fixture, 'access-device-revoke-confirm')).toBeNull();
    expect(query(fixture, 'access-empty')).toBeNull();

    // El enlace publica su vencimiento, sus canjes y su estado, y ofrece el acto una sola vez.
    expect(query(fixture, 'access-invitation-invitation-1')?.textContent).toContain(
      'vence 2026-11-04 · 2 canjes',
    );
    expect(query(fixture, 'access-invitation-state')?.textContent).toContain('activo');
    expect(query(fixture, 'access-invitation-cancel')).not.toBeNull();
    expect(query(fixture, 'access-invitation-cancel-confirm')).toBeNull();
    expect(query(fixture, 'access-invitations-empty')).toBeNull();
  });

  it('says the event has no administrator instead of inventing one', async () => {
    const fixture = await render([], null);

    expect(query(fixture, 'dashboard-unclaimed')).not.toBeNull();
    expect(query(fixture, 'dashboard-administrator')).toBeNull();
    expect(query(fixture, 'access-empty')).not.toBeNull();
    expect(query(fixture, 'access-invitations-empty')).not.toBeNull();
  });

  it('shows a revoked device as evidence and offers no act over it', async () => {
    const fixture = await render([REVOKED], ADMINISTRATOR);

    expect(query(fixture, 'access-device-state')?.textContent).toContain('sin acceso');
    expect(query(fixture, 'access-device-revoke')).toBeNull();
  });

  it('shows a cancelled link as evidence and offers no act over it', async () => {
    const fixture = await render([], ADMINISTRATOR, [CANCELLED]);

    expect(query(fixture, 'access-invitation-state')?.textContent).toContain('cancelado');
    expect(query(fixture, 'access-invitation-cancel')).toBeNull();
    expect(query(fixture, 'access-invitation-cancel-confirm')).toBeNull();
  });

  it('shows the captures with their state and offers delete only for an unsold item', async () => {
    const fixture = await render([], ADMINISTRATOR);

    expect(query(fixture, 'dashboard-captures')).not.toBeNull();
    expect(query(fixture, 'dashboard-item-row-item-1')?.textContent).toContain('Mesa de roble');
    expect(query(fixture, 'dashboard-item-delete')).not.toBeNull();
    expect(query(fixture, 'dashboard-item-sold')).toBeNull();

    // Eliminar no se confunde con Despublicar: la copia declara el borrado irreversible y remite a
    // la otra pestaña para retirar sin destruir.
    expect(query(fixture, 'dashboard-captures')?.textContent).toContain('no se puede deshacer');
    expect(query(fixture, 'dashboard-captures')?.textContent).toContain('Despublicar');
  });

  it('keeps a sold capture and says why it cannot be deleted', async () => {
    const sold: ItemSummary = {
      ...ITEM,
      publishedSlug: 'mesa-de-roble-000000',
      soldAt: '2026-11-02T12:00:00.000Z',
    };
    const fixture = await render([], ADMINISTRATOR, [], [sold]);

    expect(query(fixture, 'dashboard-item-sold')?.textContent).toContain('evidencia');
    expect(query(fixture, 'dashboard-item-delete')).toBeNull();
  });

  it('asks for confirmation in two touches before deleting and reloads the shared list', async () => {
    const fixture = await render([], ADMINISTRATOR);

    query(fixture, 'dashboard-item-delete')?.click();
    fixture.detectChanges();
    expect(query(fixture, 'dashboard-item-delete-confirm')).not.toBeNull();
    expect(query(fixture, 'dashboard-item-delete-confirm')?.textContent).toContain(
      'Confirmar borrado',
    );

    query(fixture, 'dashboard-item-delete-confirm')?.click();
    httpTesting.expectOne(ITEM_DELETE_URL).flush(null, { status: 204, statusText: 'No Content' });

    await tick();
    httpTesting.expectOne(ITEMS_URL).flush({ items: [] });

    await tick();
    fixture.detectChanges();

    expect(query(fixture, 'dashboard-item-row-item-1')).toBeNull();
    expect(query(fixture, 'dashboard-captures-empty')).not.toBeNull();
    expect(query(fixture, 'dashboard-counts')?.textContent).toContain('Capturados: 0');
  });

  it('translates item_sold into its own phrase instead of a retry', async () => {
    const fixture = await render([], ADMINISTRATOR);

    query(fixture, 'dashboard-item-delete')?.click();
    fixture.detectChanges();
    query(fixture, 'dashboard-item-delete-confirm')?.click();
    httpTesting
      .expectOne(ITEM_DELETE_URL)
      .flush({ error: 'item_sold' }, { status: 409, statusText: 'Conflict' });

    await tick();
    fixture.detectChanges();

    expect(query(fixture, 'dashboard-item-error')?.textContent).toContain('vendido');
    expect(query(fixture, 'dashboard-item-row-item-1')).not.toBeNull();
  });

  it('asks for confirmation in two touches and reloads after revoking', async () => {
    const fixture = await render([DEVICE], ADMINISTRATOR);

    query(fixture, 'access-device-revoke')?.click();
    fixture.detectChanges();
    expect(query(fixture, 'access-device-revoke-confirm')).not.toBeNull();

    query(fixture, 'access-device-revoke-confirm')?.click();
    httpTesting.expectOne(REVOKE_URL).flush(null, { status: 204, statusText: 'No Content' });

    await tick();
    httpTesting
      .expectOne(DASHBOARD_URL)
      .flush({ administrator: ADMINISTRATOR, devices: [REVOKED], invitations: [] });

    // Mientras el panel recarga se desmonta: al volver, el campo del WhatsApp se monta otra vez y
    // relee el número.
    await tick();
    fixture.detectChanges();
    httpTesting.expectOne(CONTACT_URL).flush({ contactPhone: null });

    await tick();
    fixture.detectChanges();

    expect(query(fixture, 'access-device-revoke')).toBeNull();
    expect(query(fixture, 'access-device-state')?.textContent).toContain('sin acceso');
  });

  it('asks for confirmation in two touches and reloads after cancelling a link', async () => {
    const fixture = await render([], ADMINISTRATOR, [INVITATION]);

    query(fixture, 'access-invitation-cancel')?.click();
    fixture.detectChanges();
    expect(query(fixture, 'access-invitation-cancel-confirm')).not.toBeNull();

    query(fixture, 'access-invitation-cancel-confirm')?.click();
    httpTesting.expectOne(CANCEL_URL).flush(null, { status: 204, statusText: 'No Content' });

    await tick();
    httpTesting
      .expectOne(DASHBOARD_URL)
      .flush({ administrator: ADMINISTRATOR, devices: [], invitations: [CANCELLED] });

    await tick();
    fixture.detectChanges();
    httpTesting.expectOne(CONTACT_URL).flush({ contactPhone: null });

    await tick();
    fixture.detectChanges();

    expect(query(fixture, 'access-invitation-cancel')).toBeNull();
    expect(query(fixture, 'access-invitation-state')?.textContent).toContain('cancelado');
    expect(text(fixture)).not.toContain('Cancelar enlace');
  });

  it('publishes the cart requests with the buyer name and the snapshot of what was asked', async () => {
    const fixture = await render([], ADMINISTRATOR, [], [ITEM], [CART_REQUEST]);

    expect(query(fixture, 'dashboard-request-request-1')?.textContent).toContain('Compradora');
    expect(query(fixture, 'dashboard-request-request-1')?.textContent).toContain('Mesa de roble');
    expect(query(fixture, 'dashboard-request-request-1')?.textContent).toContain('$1,250.00 MXN');
    expect(query(fixture, 'dashboard-request-state')?.textContent).toContain('pendiente');
    expect(query(fixture, 'dashboard-request-dismiss')).not.toBeNull();
  });

  it('dismisses a request in two touches and reloads the list', async () => {
    const fixture = await render([], ADMINISTRATOR, [], [ITEM], [CART_REQUEST]);

    query(fixture, 'dashboard-request-dismiss')?.click();
    fixture.detectChanges();
    expect(query(fixture, 'dashboard-request-dismiss-confirm')).not.toBeNull();

    query(fixture, 'dashboard-request-dismiss-confirm')?.click();
    httpTesting
      .expectOne(REQUEST_DISMISS_URL)
      .flush(null, { status: 204, statusText: 'No Content' });

    await tick();
    httpTesting.expectOne(REQUESTS_URL).flush({
      requests: [{ ...CART_REQUEST, dismissedAt: '2026-11-04T19:00:00.000Z' }],
    });

    await tick();
    fixture.detectChanges();

    expect(query(fixture, 'dashboard-request-state')?.textContent).toContain('atendida');
    expect(query(fixture, 'dashboard-request-dismiss')).toBeNull();
  });

  it('says there are no requests yet instead of inventing rows', async () => {
    const fixture = await render([], ADMINISTRATOR);

    expect(query(fixture, 'dashboard-requests-empty')).not.toBeNull();
    expect(query(fixture, 'dashboard-request-state')).toBeNull();
  });

  it('publishes the WhatsApp of the event and saves the normalized number', async () => {
    const fixture = await render([], ADMINISTRATOR);

    expect(query(fixture, 'dashboard-contact-empty')).not.toBeNull();

    const input = query(fixture, 'dashboard-contact-input') as HTMLInputElement;
    input.value = '+52 55 1234 5678';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    query(fixture, 'dashboard-contact-save')?.click();
    httpTesting.expectOne(CONTACT_URL).flush({ contactPhone: '525512345678' });

    await tick();
    fixture.detectChanges();

    expect(query(fixture, 'dashboard-contact-saved')?.textContent).toContain('+525512345678');
    expect(query(fixture, 'dashboard-contact-clear')).not.toBeNull();
  });

  it('translates a rejected number instead of saving it', async () => {
    const fixture = await render([], ADMINISTRATOR);

    const input = query(fixture, 'dashboard-contact-input') as HTMLInputElement;
    input.value = 'doce';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    query(fixture, 'dashboard-contact-save')?.click();
    httpTesting
      .expectOne(CONTACT_URL)
      .flush({ error: 'validation_failed' }, { status: 400, statusText: 'Bad Request' });

    await tick();
    fixture.detectChanges();

    expect(query(fixture, 'dashboard-contact-error')?.textContent).toContain('8 y 15 dígitos');
    expect(query(fixture, 'dashboard-contact-empty')).not.toBeNull();
  });

  it('translates the forbidden cancel into its own phrase', async () => {
    const fixture = await render([], ADMINISTRATOR, [INVITATION]);

    query(fixture, 'access-invitation-cancel')?.click();
    fixture.detectChanges();
    query(fixture, 'access-invitation-cancel-confirm')?.click();

    httpTesting
      .expectOne(CANCEL_URL)
      .flush({ error: 'forbidden' }, { status: 403, statusText: 'Forbidden' });

    await tick();
    fixture.detectChanges();

    expect(query(fixture, 'access-error')?.textContent).toContain(
      'No puedes cancelar un enlace de este evento.',
    );
    expect(query(fixture, 'access-invitation-cancel')).not.toBeNull();
  });
});
