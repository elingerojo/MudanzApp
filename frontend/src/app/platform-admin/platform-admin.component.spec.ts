import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { AdminEventSummary } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { PlatformAdminComponent } from './platform-admin.component';

/**
 * La administración de plataforma (ciclo E1, decisión §46).
 *
 * Se prueba lo que la pantalla **hace** y lo que deliberadamente no hace: no pide nada al borde sin
 * credencial, no la guarda en el disco, descarta una credencial que el borde rechaza y enseña la
 * emisión del enlace una sola vez.
 */
const LIST_URL = '/api/admin/events?limit=20';

const EVENT: AdminEventSummary = {
  id: 'event-1',
  publicSlug: 'bogota-ciudad-de-mexico-3f9a2c',
  originCity: 'Bogotá',
  destinationCity: 'Ciudad de México',
  currency: 'MXN',
  state: 'active',
  createdAt: '2026-11-02T09:00:00.000Z',
  administratorName: null,
};

const CLAIMED: AdminEventSummary = { ...EVENT, id: 'event-2', administratorName: 'Ana' };

const INVITATION = {
  id: 'invitation-1',
  token: 'tok-123',
  expiresAt: '2026-11-09T09:00:00.000Z',
  maxUses: 5,
  label: 'soga',
};

function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('PlatformAdminComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [PlatformAdminComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  function render(): ComponentFixture<PlatformAdminComponent> {
    const fixture = TestBed.createComponent(PlatformAdminComponent);
    fixture.detectChanges();
    return fixture;
  }

  function query(
    fixture: ComponentFixture<PlatformAdminComponent>,
    testId: string,
  ): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
  }

  function setInput(
    fixture: ComponentFixture<PlatformAdminComponent>,
    testId: string,
    value: string,
  ): void {
    const input = query(fixture, testId);
    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`missing-input:${testId}`);
    }

    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function click(fixture: ComponentFixture<PlatformAdminComponent>, testId: string): void {
    const control = query(fixture, testId);
    if (control === null) {
      throw new Error(`missing-control:${testId}`);
    }

    control.click();
    fixture.detectChanges();
  }

  async function signIn(
    fixture: ComponentFixture<PlatformAdminComponent>,
    events: readonly AdminEventSummary[],
    nextCursor: string | null = null,
  ): Promise<void> {
    setInput(fixture, 'platform-admin-token', 'admin-token');
    click(fixture, 'platform-admin-signin');

    const request = httpTesting.expectOne(LIST_URL);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer admin-token');
    request.flush({ events, nextCursor });

    await tick();
    fixture.detectChanges();
  }

  it('asks the edge for nothing until the credential is written', () => {
    const fixture = render();

    expect(query(fixture, 'platform-admin-gate')).not.toBeNull();
    expect(query(fixture, 'platform-admin-panel')).toBeNull();
    expect(query(fixture, 'platform-admin-memory-note')?.textContent).toContain('pestaña');
    // Sin credencial no hay petición: `afterEach` falla si algo salió al borde.
  });

  it('sends the credential as its own Authorization and lists the events', async () => {
    const fixture = render();
    await signIn(fixture, [EVENT, CLAIMED]);

    expect(query(fixture, 'platform-admin-panel')).not.toBeNull();
    expect(query(fixture, 'platform-admin-event-event-1')?.textContent).toContain('Bogotá');
    expect(query(fixture, 'platform-admin-event-event-1')?.textContent).toContain(
      'sin administrador',
    );
    expect(query(fixture, 'platform-admin-event-event-2')?.textContent).toContain('Ana');
    expect(query(fixture, 'platform-admin-more')).toBeNull();
    expect(query(fixture, 'platform-admin-empty')).toBeNull();
  });

  it('keeps the credential out of the disk', async () => {
    const fixture = render();
    await signIn(fixture, [EVENT]);

    expect(localStorage.length).toBe(0);
    expect(JSON.stringify(localStorage)).not.toContain('admin-token');
  });

  it('discards a credential the edge rejects instead of keeping it in memory', async () => {
    const fixture = render();
    setInput(fixture, 'platform-admin-token', 'wrong-token');
    click(fixture, 'platform-admin-signin');

    httpTesting
      .expectOne(LIST_URL)
      .flush({ error: 'admin_unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    await tick();
    fixture.detectChanges();

    expect(query(fixture, 'platform-admin-gate')).not.toBeNull();
    expect(query(fixture, 'platform-admin-panel')).toBeNull();
    expect(query(fixture, 'platform-admin-error')?.textContent).toContain(
      'credencial no es válida',
    );
  });

  it('explains a platform without ADMIN_TOKEN instead of asking for the token again', async () => {
    const fixture = render();
    setInput(fixture, 'platform-admin-token', 'admin-token');
    click(fixture, 'platform-admin-signin');

    httpTesting
      .expectOne(LIST_URL)
      .flush({ error: 'admin_not_configured' }, { status: 503, statusText: 'Unavailable' });

    await tick();
    fixture.detectChanges();

    expect(query(fixture, 'platform-admin-error')?.textContent).toContain('ADMIN_TOKEN');
  });

  it('extends the list with the cursor and hides the control on the last page', async () => {
    const fixture = render();
    setInput(fixture, 'platform-admin-token', 'admin-token');
    click(fixture, 'platform-admin-signin');
    httpTesting.expectOne(LIST_URL).flush({ events: [EVENT], nextCursor: 'cursor-1' });

    await tick();
    fixture.detectChanges();
    expect(query(fixture, 'platform-admin-more')).not.toBeNull();

    click(fixture, 'platform-admin-more');
    const second = httpTesting.expectOne(`${LIST_URL}&cursor=cursor-1`);
    expect(second.request.headers.get('Authorization')).toBe('Bearer admin-token');
    second.flush({ events: [CLAIMED], nextCursor: null });

    await tick();
    fixture.detectChanges();

    expect(query(fixture, 'platform-admin-event-event-1')).not.toBeNull();
    expect(query(fixture, 'platform-admin-event-event-2')).not.toBeNull();
    expect(query(fixture, 'platform-admin-more')).toBeNull();
  });

  it('creates the event and reloads the first page', async () => {
    const fixture = render();
    await signIn(fixture, []);

    expect(query(fixture, 'platform-admin-empty')).not.toBeNull();

    setInput(fixture, 'platform-admin-origin', 'Bogotá');
    setInput(fixture, 'platform-admin-destination', 'Medellín');

    const form = query(fixture, 'platform-admin-create-form');
    form?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const created = httpTesting.expectOne('/api/admin/events');
    expect(created.request.method).toBe('POST');
    expect(created.request.headers.get('Authorization')).toBe('Bearer admin-token');
    expect(created.request.body).toEqual({
      originCity: 'Bogotá',
      destinationCity: 'Medellín',
    });
    created.flush({ event: { ...EVENT, originCity: 'Bogotá', destinationCity: 'Medellín' } });

    await tick();
    httpTesting.expectOne(LIST_URL).flush({ events: [EVENT], nextCursor: null });

    await tick();
    fixture.detectChanges();

    expect(query(fixture, 'platform-admin-event-event-1')).not.toBeNull();
    expect((query(fixture, 'platform-admin-origin') as HTMLInputElement).value).toBe('');
  });

  it('asks for nothing while the create form has no cities', async () => {
    const fixture = render();
    await signIn(fixture, []);

    const create = query(fixture, 'platform-admin-create') as HTMLButtonElement | null;
    expect(create?.disabled).toBe(true);
  });

  it('shows the invitation link once, with its label and its expiry', async () => {
    const fixture = render();
    await signIn(fixture, [EVENT]);

    click(fixture, 'platform-admin-invite-event-1');

    const issued = httpTesting.expectOne('/api/admin/events/event-1/invitations');
    expect(issued.request.method).toBe('POST');
    expect(issued.request.headers.get('Authorization')).toBe('Bearer admin-token');
    issued.flush(INVITATION);

    await tick();
    fixture.detectChanges();

    const panel = query(fixture, 'platform-admin-invitation');
    expect(panel?.textContent).toContain('soga');
    expect(panel?.textContent).toContain('vence 2026-11-09');

    const url = query(fixture, 'platform-admin-invitation-url');
    expect((url as HTMLInputElement).value).toContain('/invitacion?token=tok-123');
  });

  it('forgets the credential and the list on sign out', async () => {
    const fixture = render();
    await signIn(fixture, [EVENT]);

    click(fixture, 'platform-admin-signout');

    expect(query(fixture, 'platform-admin-gate')).not.toBeNull();
    expect(query(fixture, 'platform-admin-panel')).toBeNull();
    expect((query(fixture, 'platform-admin-token') as HTMLInputElement).value).toBe('');
    expect(localStorage.length).toBe(0);
  });
});
