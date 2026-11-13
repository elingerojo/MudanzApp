import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { EventSummary } from '@mudanzapp/shared';

import { SessionStore } from '../session/session.store';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { EventContextComponent } from './event-context.component';

/**
 * El contexto del evento del corte D8: lo que el marco del evento publicaba —trayecto, enlace público
 * y aviso de sesión inválida— ahora es una pieza compartida por `Captura` y `Capturados`.
 */
const EVENT: EventSummary = {
  id: 'event-1',
  publicSlug: 'bogota-ciudad-de-mexico-3f9a2c',
  originCity: 'Bogotá',
  destinationCity: 'Ciudad de México',
  currency: 'MXN',
  state: 'open',
  role: 'member',
  onboardingLevel: 0,
};

describe('EventContextComponent', () => {
  const activeEvent = signal<EventSummary | null>(EVENT);
  const identityFailed = signal(false);

  beforeEach(async () => {
    activeEvent.set(EVENT);
    identityFailed.set(false);

    await TestBed.configureTestingModule({
      imports: [EventContextComponent],
      providers: [
        { provide: SHOP_BASE_URL, useValue: 'http://shop.test' },
        {
          provide: SessionStore,
          useValue: { activeEvent, identityFailed },
        },
      ],
    }).compileComponents();
  });

  function render() {
    const fixture = TestBed.createComponent(EventContextComponent);
    fixture.detectChanges();
    return fixture;
  }

  function query(fixture: ReturnType<typeof render>, testId: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
  }

  it('publishes the route and the public link of the active event', () => {
    const fixture = render();

    expect(query(fixture, 'event-title')?.textContent).toContain('Bogotá → Ciudad de México');
    expect(query(fixture, 'event-public-link')?.textContent).toContain(
      'http://shop.test/evento/bogota-ciudad-de-mexico-3f9a2c',
    );
  });

  it('falls back to a neutral title while the identity has no event', () => {
    activeEvent.set(null);

    const fixture = render();

    expect(query(fixture, 'event-title')?.textContent).toContain('Evento');
    expect(query(fixture, 'event-public-link')).toBeNull();
  });

  it('keeps the warning visible when the session is no longer valid', () => {
    identityFailed.set(true);

    const fixture = render();

    expect(query(fixture, 'event-session-invalid')).not.toBeNull();
  });
});
