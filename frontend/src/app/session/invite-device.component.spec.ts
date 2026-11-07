import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { CreatedInvitation, EventSummary } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { InviteDeviceComponent, invitationLink } from './invite-device.component';
import { SessionStore } from './session.store';

/**
 * El card de la Cuenta (corrección de 4a, `plan-ciclo-4a-correccion-cache-y-cuenta` §3 y §7).
 *
 * La sesión se sustituye por un doble con los eventos visibles: lo que se prueba es que el card use
 * el evento de la sesión y no invente uno, que componga el enlace con el `origin` del marco y que un
 * fallo no deje un enlace a medias.
 */
const EVENT = {
  id: 'event-1',
  publicSlug: 'bogota-ciudad-de-mexico-3f9a2c',
  originCity: 'Bogotá',
  destinationCity: 'Ciudad de México',
  currency: 'MXN',
  state: 'active',
  role: null,
} as const satisfies EventSummary;

const INVITATION = {
  id: 'invitation-1',
  token: 'tok-1',
  expiresAt: '2026-11-05T00:00:00.000Z',
  maxUses: 5,
  label: 'caja',
} as const satisfies CreatedInvitation;

describe('InviteDeviceComponent', () => {
  let httpTesting: HttpTestingController;
  let events: EventSummary[];

  beforeEach(async () => {
    events = [EVENT];

    await TestBed.configureTestingModule({
      imports: [InviteDeviceComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: SessionStore, useValue: { activeEvent: () => events[0] ?? null } },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function render(): ComponentFixture<InviteDeviceComponent> {
    const fixture = TestBed.createComponent(InviteDeviceComponent);
    fixture.detectChanges();
    return fixture;
  }

  function inviteButton(fixture: ComponentFixture<InviteDeviceComponent>): HTMLButtonElement {
    return fixture.nativeElement.querySelector(
      '[data-testid="shell-invite-create"]',
    ) as HTMLButtonElement;
  }

  it('asks the session event for an invitation and composes the link', async () => {
    const fixture = render();

    inviteButton(fixture).click();

    const request = httpTesting.expectOne('/api/events/event-1/invitations');
    expect(request.request.method).toBe('POST');
    request.flush(INVITATION);

    await fixture.whenStable();
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      '[data-testid="shell-invite-url"]',
    ) as HTMLInputElement;

    expect(link.value).toBe(`${globalThis.location.origin}/invitacion?token=tok-1&etiqueta=caja`);
    expect(link.value).toBe(invitationLink('tok-1', 'caja'));
    expect(link.readOnly).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="shell-invite-error"]')).toBeNull();
  });

  it('translates a session the backend no longer accepts and leaves no link', async () => {
    const fixture = render();

    inviteButton(fixture).click();
    httpTesting
      .expectOne('/api/events/event-1/invitations')
      .flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    await fixture.whenStable();
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector(
      '[data-testid="shell-invite-error"]',
    ) as HTMLElement | null;

    expect(error?.textContent).toContain('ya no sirve');
    expect(fixture.nativeElement.querySelector('[data-testid="shell-invite-url"]')).toBeNull();
  });

  it('draws nothing when the session has no event', () => {
    events = [];

    const fixture = render();

    expect(fixture.nativeElement.querySelector('[data-testid="shell-invite-create"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('h2')).toBeNull();
  });

  it('keeps the token and the label encoded in the link', () => {
    expect(invitationLink('a b', 'caja')).toBe(
      `${globalThis.location.origin}/invitacion?token=a%20b&etiqueta=caja`,
    );
    expect(invitationLink('tok', 'a b')).toBe(
      `${globalThis.location.origin}/invitacion?token=tok&etiqueta=a%20b`,
    );
  });
});
