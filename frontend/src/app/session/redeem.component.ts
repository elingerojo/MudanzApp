import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { IssuedSession } from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import { INVITATION_INVALID, apiErrorCode } from './api-error';
import { deviceLabel } from './device-label';
import { SessionStore } from './session.store';
import { UiCardComponent } from '../ui/ui-card/ui-card';
import { uiButtonClasses } from '../ui/ui-button/ui-button';

/**
 * Canje del enlace (`/invitacion?token=…`).
 *
 * El token de la invitación **sí** viaja en el enlace: es la capacidad. El de sesión nunca: se
 * guarda en el dispositivo y viaja solo en `Authorization` (decisión §22). Acepta el token suelto o
 * el enlace completo pegado, para que el camino funcione también en un escritorio.
 *
 * No pide cuenta: el canje emite una sesión de evento sin sujeto (`decisiones` §30).
 */
function tokenFromInput(raw: string): string {
  const trimmed = raw.trim();
  const marker = trimmed.indexOf('token=');
  if (marker === -1) {
    return trimmed;
  }

  const rest = (trimmed.slice(marker + 'token='.length).split('&')[0] ?? '').trim();
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

@Component({
  selector: 'app-redeem',
  imports: [RouterLink, UiCardComponent],
  templateUrl: './redeem.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RedeemComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly session = inject(SessionStore);

  protected readonly token = signal(
    tokenFromInput(this.route.snapshot.queryParamMap.get('token') ?? ''),
  );
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  /** El canje no navega: es un envío, así que usa las clases de la primitiva, no su host. */
  protected readonly primaryClasses = uiButtonClasses('primary');

  protected onTokenInput(event: Event): void {
    this.token.set((event.target as HTMLInputElement).value);
  }

  protected async redeem(): Promise<void> {
    const inviteToken = tokenFromInput(this.token());
    if (inviteToken.length === 0) {
      this.error.set('Pega el enlace o su token para continuar.');
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    try {
      const issued = await firstValueFrom(
        this.http.post<IssuedSession>(`${this.apiBaseUrl}/auth/redeem`, {
          inviteToken,
          deviceLabel: deviceLabel(),
        }),
      );

      this.session.establish(issued);
      const eventId = issued.event?.id ?? null;
      await this.router.navigate(eventId === null ? ['/'] : ['/eventos', eventId]);
    } catch (error: unknown) {
      this.error.set(
        apiErrorCode(error) === INVITATION_INVALID
          ? 'El enlace ya no sirve: se agotaron sus canjes, venció o fue revocado.'
          : 'No se pudo canjear el enlace. Inténtalo de nuevo.',
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
