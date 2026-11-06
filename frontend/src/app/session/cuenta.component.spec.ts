import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import type { EventSummary, IdentityUser } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { CuentaComponent } from './cuenta.component';
import { OAUTH_FLOW } from './oauth-flow';
import { SessionStore } from './session.store';

/**
 * La pantalla `Cuenta` del corte D8: el destino raíz que reemplaza al popover. Publica la identidad,
 * el enlace del evento, el acceso al dashboard y el cierre de sesión; el detalle completo es D9.
 */
const EVENT: EventSummary = {
  id: 'event-1',
  publicSlug: 'bogota-ciudad-de-mexico-3f9a2c',
  originCity: 'Bogotá',
  destinationCity: 'Ciudad de México',
  currency: 'MXN',
  state: 'open',
  role: 'member',
};

const USER: IdentityUser = { id: 'user-1', displayName: 'Ana', isAdmin: false };

describe('CuentaComponent', () => {
  const user = signal<IdentityUser | null>(null);
  const events = signal<readonly EventSummary[]>([EVENT]);
  const clear = vi.fn();

  beforeEach(async () => {
    clear.mockReset();
    user.set(null);

    await TestBed.configureTestingModule({
      imports: [CuentaComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: SHOP_BASE_URL, useValue: 'http://shop.test' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({}) } },
        },
        { provide: OAUTH_FLOW, useValue: { begin: vi.fn() } },
        {
          provide: SessionStore,
          useValue: { user, events, activeEvent: signal(EVENT), clear },
        },
      ],
    }).compileComponents();
  });

  function render() {
    const fixture = TestBed.createComponent(CuentaComponent);
    fixture.detectChanges();
    return fixture;
  }

  function query(fixture: ReturnType<typeof render>, testId: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
  }

  it('publishes the account name and the event link', () => {
    user.set(USER);

    const fixture = render();

    expect(query(fixture, 'cuenta-identity')?.textContent).toContain('Ana');
    expect(query(fixture, 'cuenta-event-link')?.textContent).toContain(
      'http://shop.test/evento/bogota-ciudad-de-mexico-3f9a2c',
    );
  });

  it('says the device has no account and still offers the dashboard', () => {
    const fixture = render();

    expect(query(fixture, 'cuenta-identity')?.textContent).toContain(
      'Dispositivo sin cuenta vinculada',
    );
    expect(query(fixture, 'cuenta-dashboard-link')).not.toBeNull();
    expect(query(fixture, 'shell-invite-card')).not.toBeNull();
  });

  it('clears the session and returns home on sign out', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = render();

    query(fixture, 'cuenta-signout')?.click();

    expect(clear).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/']);
  });
});
