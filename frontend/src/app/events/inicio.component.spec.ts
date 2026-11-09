import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { EventSummary } from '@mudanzapp/shared';

import { SessionStore } from '../session/session.store';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { InicioComponent } from './inicio.component';
import { PhotoInboxStore } from './photo-inbox.store';

const EVENT: EventSummary = {
  id: 'event-1',
  publicSlug: 'bogota-ciudad-de-mexico',
  originCity: 'Bogotá',
  destinationCity: 'Ciudad de México',
  currency: 'COP',
  state: 'active',
  role: 'owner',
};

/**
 * La bienvenida (corte D13): presenta el evento, dice qué documentar y pide la primera foto. La foto
 * entra a la sesión de captura y el panel la recibe al montarse.
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

  function stageFiles(input: HTMLInputElement, files: readonly File[]): void {
    Object.defineProperty(input, 'files', { value: files, configurable: true });
  }

  it('publishes the event header and the instruction to document each article', () => {
    const fixture = render();

    expect(query(fixture, 'event-title')?.textContent).toContain('Bogotá');
    expect(fixture.nativeElement.textContent).toContain('Documenta cada artículo');
    expect(query(fixture, 'event-public-link')?.textContent).toContain('bogota-ciudad-de-mexico');
  });

  it('invites the first photo with the starting card', () => {
    const fixture = render();

    expect(query(fixture, 'inicio-card')?.textContent).toContain(
      'Toma una foto del artículo que quieres publicar',
    );
    expect(query(fixture, 'inicio-photo-label')?.textContent).toContain('Tomar la foto');
    expect(query(fixture, 'inicio-next-step')?.textContent).toContain('título');
  });

  it('stages the photo and opens the capture panel', () => {
    const fixture = render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const file = new File(['foto'], 'foto.png', { type: 'image/png' });
    const input = query(fixture, 'inicio-photo-input') as HTMLInputElement;
    stageFiles(input, [file]);
    input.dispatchEvent(new Event('change'));

    expect(TestBed.inject(PhotoInboxStore).peek()).toBe(file);
    expect(navigate).toHaveBeenCalledWith('/captura');
  });

  it('does nothing when the camera is cancelled', () => {
    const fixture = render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const input = query(fixture, 'inicio-photo-input') as HTMLInputElement;
    stageFiles(input, []);
    input.dispatchEvent(new Event('change'));

    expect(TestBed.inject(PhotoInboxStore).peek()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
