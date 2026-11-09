import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';

import { API_BASE_URL } from '../api-base-url.token';
import { RedeemComponent } from './redeem.component';

const STORAGE_KEY = 'mudanzapp.session';

/** Identidad que el store pide en cuanto existe una sesión; aquí solo tiene que resolver. */
const IDENTITY = { user: null, session: { id: 'session-1', scope: 'app' }, events: [] };

/**
 * El canje: guarda el token del dispositivo y navega al evento. Los dos fallos que importan son un
 * enlace que ya no sirve y un envío vacío; ninguno debe dejar la pantalla sin explicación.
 */
describe('RedeemComponent', () => {
  let httpTesting: HttpTestingController;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    localStorage.clear();
    navigate = vi.fn().mockResolvedValue(true);

    await TestBed.configureTestingModule({
      imports: [RedeemComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => 'invite-from-link' } } },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Establecer la sesión dispara `GET /auth/session`; se atiende para que `verify` no falle por
    // una petición que la prueba no estaba mirando.
    httpTesting.match(() => true).forEach((pending) => pending.flush(IDENTITY));
    httpTesting.verify();
    localStorage.clear();
  });

  function render() {
    const fixture = TestBed.createComponent(RedeemComponent);
    fixture.detectChanges();
    return fixture;
  }

  function submit(fixture: ReturnType<typeof render>): void {
    const button = fixture.nativeElement.querySelector(
      '[data-testid="redeem-submit"]',
    ) as HTMLButtonElement;
    button.click();
  }

  function errorText(fixture: ReturnType<typeof render>): string {
    const element = fixture.nativeElement.querySelector(
      '[data-testid="redeem-error"]',
    ) as HTMLElement | null;
    return element?.textContent ?? '';
  }

  it('takes the token from the link and redeems it', async () => {
    const fixture = render();

    submit(fixture);

    const request = httpTesting.expectOne('/api/auth/redeem');
    expect(request.request.body).toMatchObject({ inviteToken: 'invite-from-link' });

    request.flush({
      sessionToken: 'session-token',
      scope: 'app',
      user: null,
      event: {
        id: 'event-1',
        originCity: 'Bogotá',
        destinationCity: 'Ciudad de México',
        currency: 'MXN',
        state: 'active',
        role: null,
      },
    });

    // La sesión queda establecida dentro de la promesa: se deja correr un turno antes de mirar.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(navigate).toHaveBeenCalledWith(['/inicio']);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('session-token');
  });

  it('explains an invitation that is no longer usable', async () => {
    const fixture = render();

    submit(fixture);

    const request = httpTesting.expectOne('/api/auth/redeem');
    request.flush({ error: 'invitation_invalid' }, { status: 410, statusText: 'Gone' });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(errorText(fixture)).toContain('ya no sirve');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('refuses to submit an empty token without calling the backend', async () => {
    const fixture = render();
    const input = fixture.nativeElement.querySelector(
      '[data-testid="redeem-token"]',
    ) as HTMLInputElement;

    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    submit(fixture);
    fixture.detectChanges();

    expect(errorText(fixture)).toContain('Pega el enlace');
    httpTesting.expectNone('/api/auth/redeem');
  });
});
