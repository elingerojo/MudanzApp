import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { EventSummary } from '@mudanzapp/shared';

import { SessionStore } from '../session/session.store';
import { EventSelectorComponent } from './event-selector.component';

/**
 * El selector de mudanza (corte D2).
 *
 * Lo que se prueba es que publique la lista que el borde entrega —trayecto y rol, sin inventar— y
 * que elegir fije la elección del store y navegue al destino de trabajo. Los estados de carga,
 * sesión inválida y cuenta sin mudanzas conservan su salida.
 */
const EVENT_A: EventSummary = {
  id: 'event-a',
  publicSlug: 'quito-guayaquil-1a2b3c',
  originCity: 'Quito',
  destinationCity: 'Guayaquil',
  currency: 'USD',
  state: 'open',
  role: 'owner',
  onboardingLevel: 0,
};

const EVENT_B: EventSummary = { ...EVENT_A, id: 'event-b', role: 'member', originCity: 'Loja' };

describe('EventSelectorComponent', () => {
  const events = signal<readonly EventSummary[]>([EVENT_A, EVENT_B]);
  const identityLoading = signal(false);
  const identityFailed = signal(false);
  const activeEventId = signal<string | null>(null);
  const selectEvent = vi.fn<(eventId: string) => boolean>();

  beforeEach(async () => {
    events.set([EVENT_A, EVENT_B]);
    identityLoading.set(false);
    identityFailed.set(false);
    activeEventId.set(null);
    selectEvent.mockReset();
    selectEvent.mockReturnValue(true);

    await TestBed.configureTestingModule({
      imports: [EventSelectorComponent],
      providers: [
        provideRouter([]),
        {
          provide: SessionStore,
          useValue: { events, identityLoading, identityFailed, activeEventId, selectEvent },
        },
      ],
    }).compileComponents();
  });

  function render(): ComponentFixture<EventSelectorComponent> {
    const fixture = TestBed.createComponent(EventSelectorComponent);
    fixture.detectChanges();
    return fixture;
  }

  function query(
    fixture: ComponentFixture<EventSelectorComponent>,
    testId: string,
  ): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
  }

  function choices(fixture: ComponentFixture<EventSelectorComponent>): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="event-choice"]'),
    );
  }

  it('lists every membership with its route and role', () => {
    const fixture = render();

    expect(query(fixture, 'event-selector-title')?.textContent).toContain('Tus mudanzas');
    expect(choices(fixture)).toHaveLength(2);
    expect(choices(fixture)[0]?.textContent).toContain('Quito → Guayaquil');
    expect(choices(fixture)[0]?.textContent).toContain('Administras esta mudanza');
    expect(choices(fixture)[1]?.textContent).toContain('Co-dispositivo de esta mudanza');
  });

  it('fixes the choice and goes to the work destination', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = render();

    choices(fixture)[1]?.click();

    expect(selectEvent).toHaveBeenCalledWith('event-b');
    expect(navigate).toHaveBeenCalledWith(['/inicio']);
  });

  it('does not navigate when the session cannot see the chosen membership', () => {
    selectEvent.mockReturnValue(false);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = render();

    choices(fixture)[0]?.click();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('marks the membership that is already active', () => {
    activeEventId.set('event-b');

    const fixture = render();

    expect(query(fixture, 'event-choice-current')?.textContent).toContain('Actual');
    expect(choices(fixture)[1]?.textContent).toContain('Actual');
  });

  it('waits while the identity does not resolve', () => {
    identityLoading.set(true);
    events.set([]);

    const fixture = render();

    expect(query(fixture, 'event-selector-loading')).not.toBeNull();
    expect(query(fixture, 'event-selector-empty')).toBeNull();
  });

  it('points back at the invitation when the session is no longer valid', () => {
    identityFailed.set(true);
    events.set([]);

    const fixture = render();

    expect(query(fixture, 'event-selector-invalid')?.textContent).toContain(
      'Canjea una invitación nueva',
    );
    expect(query(fixture, 'event-selector-empty')).toBeNull();
  });

  it('offers the invitation when the account has no membership at all', () => {
    events.set([]);

    const fixture = render();

    expect(query(fixture, 'event-selector-empty')?.textContent).toContain('Canjea una invitación');
  });
});
