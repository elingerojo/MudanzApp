import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type UrlTree } from '@angular/router';

import { DashboardDenialComponent } from './dashboard-denial.component';

/**
 * El aviso del rechazo de la administración del evento (diagnóstico del borde, 2026-11-04; cortes D8
 * y D10).
 *
 * Antes vivía en el marco del evento. Desde D10 la pantalla a la que la guarda devuelve —`Cuenta`—
 * es su dueña. La familia del fallo viaja en la URL y se traduce sin afirmar más de lo que el borde
 * dijo.
 */
describe('DashboardDenialComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardDenialComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  /** Monta el aviso con la URL que la guarda habría escrito. */
  function render(query: string) {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue(`/cuenta${query}`);
    vi.spyOn(router, 'parseUrl').mockReturnValue({
      queryParams: Object.fromEntries(new URLSearchParams(query.replace(/^\?/, ''))),
    } as unknown as UrlTree);

    const fixture = TestBed.createComponent(DashboardDenialComponent);
    fixture.detectChanges();
    return fixture;
  }

  function notice(fixture: ReturnType<typeof render>): string | null {
    const element = fixture.nativeElement.querySelector(
      '[data-testid="event-dashboard-denied"]',
    ) as HTMLElement | null;
    return element?.textContent ?? null;
  }

  it('names the refusal the border declared, without inventing who administers', () => {
    expect(notice(render('?denied=dashboard&reason=forbidden'))).toContain(
      'esta cuenta no administra el evento',
    );
  });

  it('says the event is not among the session ones when that is what the border answered', () => {
    expect(notice(render('?denied=dashboard&reason=not_found'))).toContain(
      'no aparece entre los de tu sesión',
    );
  });

  it('does not pass a failed read off as a refusal', () => {
    const text = notice(render('?denied=dashboard&reason=unavailable'));
    expect(text).toContain('No se pudo leer el panel');
    expect(text).not.toContain('no administra');
  });

  it('keeps the meaning of a URL written before the diagnosis: a refusal', () => {
    expect(notice(render('?denied=dashboard'))).toContain('esta cuenta no administra el evento');
  });

  it('shows no notice when the URL carries no denial', () => {
    expect(notice(render(''))).toBeNull();
  });
});
