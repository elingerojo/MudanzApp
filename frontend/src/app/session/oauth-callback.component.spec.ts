import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { IssuedSession } from '@mudanzapp/shared';
import type { Mock } from 'vitest';

import { API_BASE_URL } from '../api-base-url.token';
import { OAuthCallbackComponent } from './oauth-callback.component';
import { OAUTH_FLOW, OAuthFlowError, type OAuthFlow } from './oauth-flow';
import { SessionStore } from './session.store';

/**
 * La vuelta del proveedor (ciclo 4c-1).
 *
 * El recorrido tiene dos pasos y la prueba los separa: el flujo devuelve el `id_token` y el reclamo lo
 * entrega al backend, que emite la sesión de cuenta. Un `state` ajeno no produce ninguna petición.
 */
const ISSUED = {
  sessionToken: 'account-session-token',
  scope: 'app',
  user: { id: 'user-1', displayName: 'Cuenta', isAdmin: false },
  event: {
    id: 'event-1',
    publicSlug: 'bogota-ciudad-de-mexico-3f9a2c',
    originCity: 'Bogotá',
    destinationCity: 'Ciudad de México',
    currency: 'MXN',
    state: 'active',
    role: 'member',
  },
} as const satisfies IssuedSession;

describe('OAuthCallbackComponent', () => {
  let httpTesting: HttpTestingController;
  let complete: Mock<OAuthFlow['complete']>;
  let establish: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    complete = vi.fn<OAuthFlow['complete']>().mockResolvedValue('id-token-verificado');
    establish = vi.fn();
    navigate = vi.fn().mockResolvedValue(true);

    const flow: OAuthFlow = { begin: vi.fn<OAuthFlow['begin']>(), complete };

    await TestBed.configureTestingModule({
      imports: [OAuthCallbackComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: OAUTH_FLOW, useValue: flow },
        { provide: SessionStore, useValue: { establish } },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => {
                  if (key === 'code') {
                    return 'code-1';
                  }
                  if (key === 'state') {
                    return 'state-1';
                  }
                  return null;
                },
              },
            },
          },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  async function render() {
    const fixture = TestBed.createComponent(OAuthCallbackComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function errorText(fixture: Awaited<ReturnType<typeof render>>): string {
    return (
      (
        fixture.nativeElement.querySelector(
          '[data-testid="oauth-callback-error"]',
        ) as HTMLElement | null
      )?.textContent ?? ''
    );
  }

  it('entrega el id_token al reclamo, guarda la sesión y vuelve al evento', async () => {
    const fixture = await render();

    const claim = httpTesting.expectOne('/api/auth/claim');
    expect(claim.request.method).toBe('POST');
    expect(claim.request.body).toMatchObject({ oauthToken: 'id-token-verificado' });
    expect(typeof (claim.request.body as { deviceLabel?: unknown }).deviceLabel).toBe('string');
    claim.flush(ISSUED);

    await fixture.whenStable();

    expect(establish).toHaveBeenCalledWith(ISSUED);
    expect(navigate).toHaveBeenCalledWith(['/eventos', 'event-1'], { replaceUrl: true });
  });

  it('no reclama nada cuando el state no corresponde a esta visita', async () => {
    complete.mockRejectedValue(new OAuthFlowError('oauth_state_mismatch'));

    const fixture = await render();

    httpTesting.expectNone('/api/auth/claim');
    expect(establish).not.toHaveBeenCalled();
    expect(errorText(fixture)).toContain('no corresponde a esta visita');
  });

  it('traduce el rechazo del backend cuando el dispositivo ya tiene cuenta', async () => {
    const fixture = await render();

    const claim = httpTesting.expectOne('/api/auth/claim');
    claim.flush({ error: 'session_not_claimable' }, { status: 409, statusText: 'Conflict' });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(establish).not.toHaveBeenCalled();
    expect(errorText(fixture)).toContain('ya tiene una cuenta vinculada');
  });
});
