import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Mock } from 'vitest';

import { API_BASE_URL } from '../api-base-url.token';
import { OAUTH_FLOW, OAuthFlowError, type OAuthFlow } from '../session/oauth-flow';
import { SessionStore } from '../session/session.store';
import { HomeComponent } from './home.component';

/**
 * La portada con dos puertas (ciclo 4c-1c).
 *
 * Lo que se prueba no es que las dos existan, sino **en qué orden**: el enlace primero —es como se
 * entra la primera vez— y la cuenta después, que es como se vuelve (decisión §30). Y que la segunda
 * abre el flujo con propósito `signin`, que es lo que el callback necesita para no intentar reclamar.
 */
const HEALTH = { status: 'ok', database: 'ok' };

describe('HomeComponent', () => {
  let httpTesting: HttpTestingController;
  let begin: Mock<OAuthFlow['begin']>;
  let hasSession: boolean;
  let identityFailed: boolean;

  beforeEach(async () => {
    begin = vi.fn<OAuthFlow['begin']>().mockResolvedValue(undefined);
    hasSession = false;
    identityFailed = false;

    const flow: OAuthFlow = { begin, complete: vi.fn<OAuthFlow['complete']>() };

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        // Las dos puertas son `app-ui-button` con `link`, así que el TestBed necesita el router: un
        // enlace interno se resuelve con `RouterLink` y sin él no hay `ActivatedRoute` que inyectar.
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: OAUTH_FLOW, useValue: flow },
        {
          provide: SessionStore,
          useValue: {
            hasSession: () => hasSession,
            user: () => null,
            identityFailed: () => identityFailed,
            events: () => [],
            clear: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Cualquier petición que la prueba no haya mirado se atiende aquí para que `verify` no falle.
    httpTesting.match(() => true).forEach((request) => request.flush(HEALTH));
    httpTesting.verify();
  });

  /**
   * El humo de estado pide `/health` en cuanto se pinta. Se atiende **antes** de esperar
   * estabilidad: una petición pendiente de `httpResource` deja la aplicación inestable para
   * siempre y `whenStable` no resolvería (que es como este spec se quedaba en el límite de 5 s).
   */
  async function render() {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();

    httpTesting
      .match((request) => request.url.endsWith('/health'))
      .forEach((request) => {
        request.flush(HEALTH);
      });

    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('ofrece las dos puertas con el enlace primero y la cuenta después', async () => {
    const fixture = await render();
    const html = String(fixture.nativeElement.innerHTML);

    const invitation = html.indexOf('data-testid="home-door-invitation"');
    const account = html.indexOf('data-testid="home-door-account"');

    expect(invitation).toBeGreaterThan(-1);
    expect(account).toBeGreaterThan(-1);
    expect(invitation).toBeLessThan(account);
  });

  it('abre el flujo con propósito de regreso al pulsar la puerta de la cuenta', async () => {
    const fixture = await render();

    const button = fixture.nativeElement.querySelector(
      '[data-testid="home-account-signin"]',
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    expect(begin).toHaveBeenCalledWith('signin');
  });

  it('explica un proveedor sin configurar sin dejar el botón bloqueado', async () => {
    begin.mockRejectedValue(new OAuthFlowError('oauth_not_configured'));

    const fixture = await render();

    const button = fixture.nativeElement.querySelector(
      '[data-testid="home-account-signin"]',
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector(
      '[data-testid="home-account-error"]',
    ) as HTMLElement | null;

    expect(error?.textContent).toContain('no está configurada');
    expect(button.disabled).toBe(false);
  });

  it('no ofrece la puerta de la cuenta cuando el dispositivo ya tiene sesión utilizable', async () => {
    hasSession = true;

    const fixture = await render();

    expect(fixture.nativeElement.querySelector('[data-testid="home-door-account"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="home-session"]')).not.toBeNull();
  });

  it('la ofrece cuando la credencial existe pero ya no sirve, porque es el camino de vuelta', async () => {
    hasSession = true;
    identityFailed = true;

    const fixture = await render();

    expect(
      fixture.nativeElement.querySelector('[data-testid="home-session-invalid"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="home-door-account"]')).not.toBeNull();
  });
});
