import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CreatedInvitation } from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import { UiButtonComponent } from '../ui/ui-button/ui-button';
import { UiCardComponent } from '../ui/ui-card/ui-card';
import { UNAUTHORIZED, apiErrorCode } from './api-error';
import { SessionStore } from './session.store';

/**
 * Card de invitación dentro de la Cuenta del marco (corrección de 4a,
 * `plan-ciclo-4a-correccion-cache-y-cuenta` §3).
 *
 * El enlace del evento existe desde 4a; este card es la puerta que lo reparte: emite la invitación
 * con la ruta que ya existe desde el ciclo 2 y compone el enlace que canjea otro co-dispositivo, sin
 * volver al administrador.
 *
 * Tres reglas del corte:
 * - el evento sale de la sesión, igual que la barra del marco: ninguna ruta nueva y una sola fuente;
 * - el token se muestra **una vez**, en un campo de solo lectura, y no se persiste: dejarlo en
 *   `localStorage` sería un secreto en disco que §22 y §27 evitan;
 * - los términos no se reinventan aquí: son los del servidor, 72 horas y cinco canjes.
 */

/**
 * El enlace de canje: el token **sí** viaja en la URL porque es la capacidad (`decisiones` §22).
 *
 * Desde el corte 4c-fix lleva `etiqueta`, el nombre que el servidor le dio al enlace. Es decorativo:
 * el canje lee `token` y corta en el `&`, así que un valor ausente o alterado no cambia ninguna
 * decisión.
 */
export function invitationLink(token: string, label: string): string {
  return `${globalThis.location.origin}/invitacion?token=${encodeURIComponent(token)}&etiqueta=${encodeURIComponent(label)}`;
}

@Component({
  selector: 'app-invite-device',
  imports: [UiButtonComponent, UiCardComponent],
  templateUrl: './invite-device.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteDeviceComponent {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly session = inject(SessionStore);

  /**
   * El evento activo de la sesión (corte D2): con una elección explícita, el primero de la lista del
   * borde podía ser una mudanza distinta de la que el usuario está trabajando.
   */
  private readonly event = this.session.activeEvent;

  /** Sin evento no hay a quién invitar: el card no se dibuja. */
  protected readonly visible = computed(() => this.event() !== null);

  protected readonly inviting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly link = signal<string | null>(null);
  /** El nombre del enlace tal como lo devolvió el servidor: el card no elige palabras. */
  protected readonly label = signal<string | null>(null);
  protected readonly copied = signal(false);

  protected async invite(): Promise<void> {
    const event = this.event();
    if (event === null) {
      return;
    }

    this.inviting.set(true);
    this.error.set(null);
    this.copied.set(false);
    this.label.set(null);
    this.link.set(null);

    try {
      const created = await firstValueFrom(
        this.http.post<CreatedInvitation>(`${this.apiBaseUrl}/events/${event.id}/invitations`, {}),
      );
      this.label.set(created.label);
      this.link.set(invitationLink(created.token, created.label));
    } catch (failure: unknown) {
      this.error.set(
        apiErrorCode(failure) === UNAUTHORIZED
          ? 'La sesión de este dispositivo ya no sirve: entra otra vez con un enlace.'
          : 'No se pudo crear la invitación. Inténtalo de nuevo.',
      );
    } finally {
      this.inviting.set(false);
    }
  }

  /** Copiar es una comodidad: sin portapapeles el campo sigue seleccionable a mano. */
  protected async copy(): Promise<void> {
    const link = this.link();
    if (link === null) {
      return;
    }

    try {
      await globalThis.navigator.clipboard.writeText(link);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  protected selectAll(event: Event): void {
    (event.target as HTMLInputElement).select();
  }
}
