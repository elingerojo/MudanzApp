import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ONBOARDING_MAX_LEVEL, onboardingLevelCopy, type OnboardingLevel } from '@mudanzapp/shared';

import { DashboardDenialComponent } from '../events/dashboard-denial.component';
import { eventPublicUrl } from '../events/event-public-url';
import { eventTitle } from '../events/event-title';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { uiButtonClasses } from '../ui/ui-button/ui-button';
import { UiCardComponent } from '../ui/ui-card/ui-card';
import { AccountLinkComponent } from './account-link.component';
import { InviteDeviceComponent } from './invite-device.component';
import { SessionStore } from './session.store';

/**
 * Pantalla `Cuenta` (cortes D8, D9, D10 y D2).
 *
 * Es el tercer destino de la barra inferior. D8 la creó como destino mínimo para que la navegación
 * tuviera tres entradas; D9 la completa: publica la identidad y el estado del dispositivo —cuenta
 * vinculada o no, y el rol en la mudanza activa—, el trayecto y el enlace público del evento, y las
 * acciones de la sesión. D10 la convierte en la ruta padre de la administración del evento: el
 * enlace abre `/cuenta/evento` y esta pantalla es la que enseña el rechazo del co-dispositivo.
 *
 * Desde D2 una cuenta con dos o más membresías no tiene evento activo hasta que elige: la pantalla
 * enlaza al selector `/eventos` y, mientras no haya elección, pide elegir en vez de presentar la
 * mudanza más reciente como si fuera la propia.
 *
 * El `deviceLabel` de la sesión no viaja en `/auth/session`, así que la pantalla describe el
 * dispositivo por lo que el borde sí publica: el sujeto y el rol de la membresía. Pedir el nombre
 * del dispositivo es un corte de contrato propio.
 */
@Component({
  selector: 'app-cuenta',
  imports: [
    AccountLinkComponent,
    DashboardDenialComponent,
    InviteDeviceComponent,
    RouterLink,
    UiCardComponent,
  ],
  templateUrl: './cuenta.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CuentaComponent {
  private readonly session = inject(SessionStore);
  private readonly shopBaseUrl = inject(SHOP_BASE_URL);
  private readonly router = inject(Router);

  protected readonly user = this.session.user;
  protected readonly event = this.session.activeEvent;
  protected readonly signOutClasses = uiButtonClasses('danger');
  protected readonly secondaryClasses = uiButtonClasses('secondary');

  /**
   * El nivel de onboarding **efectivo** del evento activo (corte 3k). Lo deriva y publica el borde;
   * la pantalla solo lo pinta y ofrece subirlo. Una sesión sin evento no tiene nivel ni fila.
   */
  protected readonly onboardingLevel = computed<OnboardingLevel | null>(
    () => this.event()?.onboardingLevel ?? null,
  );

  /** El texto de la fila, compuesto desde la tabla `ONBOARDING_LEVELS`; no repite el umbral. */
  protected readonly onboardingCopy = computed(() => {
    const level = this.onboardingLevel();
    return level === null ? null : onboardingLevelCopy(level);
  });

  /** La acción solo existe mientras quede un escalón que subir. */
  protected readonly canRaiseOnboarding = computed(() => {
    const level = this.onboardingLevel();
    return level !== null && level < ONBOARDING_MAX_LEVEL;
  });

  protected readonly raisingOnboarding = signal(false);
  protected readonly onboardingError = signal<string | null>(null);

  /**
   * El acto de subir: la fila cambia en el mismo lugar porque la identidad se relee del borde. Un
   * fallo deja el valor anterior y su mensaje; no navega ni abre un modal.
   */
  protected async raiseOnboarding(): Promise<void> {
    if (this.raisingOnboarding()) {
      return;
    }

    this.raisingOnboarding.set(true);
    this.onboardingError.set(null);
    try {
      await this.session.raiseOnboardingLevel();
    } catch {
      this.onboardingError.set('No se pudo subir el nivel. Inténtalo de nuevo.');
    } finally {
      this.raisingOnboarding.set(false);
    }
  }

  /** Cuántas mudanzas alcanza la sesión: con dos o más, la Cuenta enlaza al selector. */
  protected readonly eventCount = computed(() => this.session.events().length);
  protected readonly hasSeveralEvents = computed(() => this.eventCount() > 1);

  /** La identidad todavía no resolvió: la pantalla espera en vez de fingir un dispositivo sin cuenta. */
  protected readonly loading = this.session.identityLoading;

  /** La sesión existe pero el backend no la reconoce: el canje es el camino de vuelta. */
  protected readonly sessionInvalid = this.session.identityFailed;

  /** Qué es este dispositivo hoy: cuenta vinculada o dispositivo del evento. */
  protected readonly deviceKind = computed(() =>
    this.user() === null ? 'Sesión de dispositivo' : 'Sesión de cuenta',
  );

  /**
   * El rol dentro de la mudanza activa, leído de la membresía.
   *
   * `role` es `null` en una sesión de evento porque no hay membresía: el texto lo dice sin inventar un
   * derecho. En una sesión de cuenta el borde publica `owner` o `member`.
   */
  protected readonly deviceDetail = computed(() => {
    if (this.user() === null) {
      return 'Este dispositivo documenta sin cuenta vinculada.';
    }

    return this.event()?.role === 'owner'
      ? 'Tu cuenta administra este evento.'
      : 'Tu cuenta es co-dispositivo de este evento.';
  });

  protected readonly eventLabel = computed(() => {
    const event = this.event();
    return event === null ? null : eventTitle(event);
  });

  protected readonly publicUrl = computed(() => {
    const event = this.event();
    return event === null ? null : eventPublicUrl(event.publicSlug, this.shopBaseUrl);
  });

  protected signOut(): void {
    this.session.clear();
    void this.router.navigate(['/']);
  }
}
