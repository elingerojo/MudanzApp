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
 * La vuelta del proveedor (ciclos 4c-1 y 4c-1c).
 *
 * Un solo callback y dos caminos, decididos por el **propósito** que devuelve el flujo: `claim` entrega
 * el token a `/auth/claim` —que exige la sesión de evento que se está reclamando— y `signin` a
 * `/auth/sessions`, que es el regreso de una cuenta ya vinculada sin pedir invitación. El caso sin
 * evento es el que más importa explicar: haber entrado no es tener acceso.
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
    complete = vi
      .fn<OAuthFlow['complete']>()
      .mockResolvedValue({ idToken: 'id-token-verificado', purpose: 'claim' });
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

  it('reclama el evento cuando el propósito es claim, guarda la sesión y vuelve al evento', async () => {
    const fixture = await render();

    const claim = httpTesting.expectOne('/api/auth/claim');
    expect(claim.request.method).toBe('POST');
    expect(claim.request.body).toMatchObject({ oauthToken: 'id-token-verificado' });
    expect(typeof (claim.request.body as { deviceLabel?: unknown }).deviceLabel).toBe('string');
    claim.flush(ISSUED);

    await fixture.whenStable();

    expect(establish).toHaveBeenCalledWith(ISSUED);
    expect(navigate).toHaveBeenCalledWith(['/inicio'], { replaceUrl: true });
  });

  it('vuelve a entrar cuando el propósito es signin, sin pedir invitación', async () => {
    complete.mockResolvedValue({ idToken: 'id-token-del-regreso', purpose: 'signin' });

    const fixture = await render();

    const signin = httpTesting.expectOne('/api/auth/sessions');
    expect(signin.request.method).toBe('POST');
    expect(signin.request.body).toMatchObject({ oauthToken: 'id-token-del-regreso' });
    signin.flush(ISSUED);

    await fixture.whenStable();

    expect(establish).toHaveBeenCalledWith(ISSUED);
    expect(navigate).toHaveBeenCalledWith(['/inicio'], { replaceUrl: true });
  });

  it('explica que la cuenta no tiene evento cuando el regreso no encuentra membresía', async () => {
    complete.mockResolvedValue({ idToken: 'id-token-del-regreso', purpose: 'signin' });

    const fixture = await render();

    const signin = httpTesting.expectOne('/api/auth/sessions');
    signin.flush({ error: 'account_not_linked' }, { status: 401, statusText: 'Unauthorized' });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(establish).not.toHaveBeenCalled();
    expect(errorText(fixture)).toContain('todavía no tiene ningún evento');
  });

  it('no canjea nada cuando el state no corresponde a esta visita', async () => {
    complete.mockRejectedValue(new OAuthFlowError('oauth_state_mismatch'));

    const fixture = await render();

    httpTesting.expectNone('/api/auth/claim');
    httpTesting.expectNone('/api/auth/sessions');
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
