import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { EventSummary } from '@mudanzapp/shared';

import { SessionStore } from '../session/session.store';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { InicioComponent } from './inicio.component';

const EVENT: EventSummary = {
  id: 'event-1',
  publicSlug: 'bogota-ciudad-de-mexico',
  originCity: 'Bogotá',
  destinationCity: 'Ciudad de México',
  currency: 'COP',
  state: 'active',
  role: 'owner',
  onboardingLevel: 0,
};

/**
 * La bienvenida (cortes D13 y D14): presenta el evento, dice qué documentar y pide la primera foto
 * sin montar una cámara propia, porque el único botón que la toma es el central de la barra.
 */
describe('InicioComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InicioComponent],
      providers: [
        provideRouter([]),
        { provide: SHOP_BASE_URL, useValue: 'https://shop.test' },
        {
          provide: SessionStore,
          useValue: {
            activeEvent: signal(EVENT),
            identityFailed: signal(false),
          },
        },
      ],
    }).compileComponents();
  });

  function render() {
    const fixture = TestBed.createComponent(InicioComponent);
    fixture.detectChanges();
    return fixture;
  }

  function query(fixture: ReturnType<typeof render>, testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  }

  it('publishes the event header and the instruction to document each article', () => {
    const fixture = render();

    expect(query(fixture, 'event-title')?.textContent).toContain('Bogotá');
    expect(fixture.nativeElement.textContent).toContain('Documenta cada artículo');
    expect(query(fixture, 'event-public-link')?.textContent).toContain('bogota-ciudad-de-mexico');
  });

  it('invites the first photo without mounting a camera of its own', () => {
    const fixture = render();

    expect(query(fixture, 'inicio-card')?.textContent).toContain(
      'Toma una foto del artículo que quieres publicar',
    );
    expect(query(fixture, 'inicio-camera-hint')?.textContent).toContain('botón Foto de la barra');

    // La cámara vive en la barra: esta pantalla no publica un segundo control.
    expect(query(fixture, 'inicio-photo-input')).toBeNull();
    expect(query(fixture, 'inicio-photo-label')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('input[type="file"]')).toBeNull();
  });
});
