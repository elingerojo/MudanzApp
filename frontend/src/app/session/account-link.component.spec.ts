import { TestBed } from '@angular/core/testing';
import type { IdentityUser } from '@mudanzapp/shared';
import type { Mock } from 'vitest';

import { AccountLinkComponent } from './account-link.component';
import { OAUTH_FLOW, OAuthFlowError, type OAuthFlow } from './oauth-flow';
import { SessionStore } from './session.store';

/**
 * `Vincular cuenta` en la Cuenta del marco (ciclo 4c-1).
 *
 * Dos hechos: la acción aparece solo donde puede hacer algo —un dispositivo con cuenta ya no
 * reclama— y el fallo del flujo se explica por código, sin dejar el botón colgado.
 */
const ACCOUNT: IdentityUser = { id: 'user-1', displayName: 'Cuenta', isAdmin: false };

describe('AccountLinkComponent', () => {
  let begin: Mock<OAuthFlow['begin']>;
  let user: IdentityUser | null;

  beforeEach(async () => {
    begin = vi.fn<OAuthFlow['begin']>().mockResolvedValue(undefined);
    user = null;

    const flow: OAuthFlow = { begin, complete: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AccountLinkComponent],
      providers: [
        { provide: OAUTH_FLOW, useValue: flow },
        { provide: SessionStore, useValue: { user: () => user } },
      ],
    }).compileComponents();
  });

  function render(): {
    readonly fixture: ReturnType<typeof TestBed.createComponent<AccountLinkComponent>>;
    readonly button: () => HTMLButtonElement | null;
    readonly error: () => string;
  } {
    const fixture = TestBed.createComponent(AccountLinkComponent);
    fixture.detectChanges();

    return {
      fixture,
      button: () =>
        fixture.nativeElement.querySelector(
          '[data-testid="shell-account-link"]',
        ) as HTMLButtonElement | null,
      error: () =>
        (
          fixture.nativeElement.querySelector(
            '[data-testid="shell-account-link-error"]',
          ) as HTMLElement | null
        )?.textContent ?? '',
    };
  }

  it('ofrece vincular la cuenta en un dispositivo sin sujeto', () => {
    const ui = render();

    expect(ui.button()).not.toBeNull();
    expect(ui.button()?.textContent).toContain('Vincular cuenta');
  });

  it('no se dibuja cuando el dispositivo ya tiene cuenta', () => {
    user = ACCOUNT;

    const ui = render();

    expect(ui.button()).toBeNull();
  });

  it('abre el flujo con propósito de reclamo al pulsar', async () => {
    const ui = render();

    ui.button()?.click();
    await ui.fixture.whenStable();

    expect(begin).toHaveBeenCalledTimes(1);
    // Reclamar es lo único que esta acción puede hacer: el regreso con cuenta vive en la portada.
    expect(begin).toHaveBeenCalledWith('claim');
  });

  it('explica un proveedor sin configurar sin dejar el botón bloqueado', async () => {
    begin.mockRejectedValue(new OAuthFlowError('oauth_not_configured'));

    const ui = render();
    ui.button()?.click();
    await ui.fixture.whenStable();
    ui.fixture.detectChanges();

    expect(ui.error()).toContain('no está configurada');
    expect(ui.button()?.disabled).toBe(false);
  });
});
