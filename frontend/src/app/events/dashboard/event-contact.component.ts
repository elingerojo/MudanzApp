import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { EventContact } from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../../api-base-url.token';
import { FORBIDDEN, VALIDATION_FAILED, apiErrorCode } from '../../session/api-error';
import { uiButtonClasses } from '../../ui/ui-button/ui-button';

/** Frase de un fallo al guardar, según el código del borde y nunca según su mensaje. */
function writeMessage(code: string | null): string {
  if (code === VALIDATION_FAILED) {
    return 'Ese número no sirve: escribe entre 8 y 15 dígitos, con el país (por ejemplo 525512345678).';
  }

  if (code === FORBIDDEN) {
    return 'Solo quien administra el evento puede cambiar este número.';
  }

  return 'No se pudo guardar el número. Inténtalo de nuevo.';
}

/**
 * El WhatsApp con el que el vendedor **recibe** los pedidos (ciclo 4e, decisión §44).
 *
 * Vive en el dashboard y no en la Cuenta del marco: esa es la superficie del event-administrator
 * (decisión §37) y el número es un hecho del evento, no de la sesión. Sin número, el botón
 * `Pídelos por WhatsApp` de la tienda no se habilita.
 *
 * Lo que se guarda son **dígitos**: la normalización la decide `parseContactPhone` en el borde, y el
 * campo acepta `+`, espacios y guiones porque es lo que la persona escribe.
 */
@Component({
  selector: 'app-dashboard-contact',
  templateUrl: './event-contact.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventContactComponent {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly eventId = inject(ActivatedRoute).snapshot.paramMap.get('eventId') ?? '';

  /** Lo que el borde tiene guardado; `null` es «sin configurar». */
  protected readonly saved = signal<string | null>(null);

  /** Lo que hay escrito en el campo, que no es lo mismo hasta que se guarda. */
  protected readonly input = signal('');

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly saveClasses = uiButtonClasses('primary');
  protected readonly clearClasses = uiButtonClasses('secondary');

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const contact = await firstValueFrom(
        this.http.get<EventContact>(`${this.apiBaseUrl}/events/${this.eventId}/contact`),
      );
      this.saved.set(contact.contactPhone);
      this.input.set(contact.contactPhone ?? '');
    } catch (error: unknown) {
      this.error.set(
        apiErrorCode(error) === FORBIDDEN
          ? 'Solo quien administra el evento puede ver este número.'
          : 'No se pudo leer el WhatsApp del evento.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }

  /** Guardar un campo vacío es quitar el número: el vacío cuenta como ausente. */
  protected async save(): Promise<void> {
    const value = this.input().trim();
    await this.write(value.length === 0 ? null : value);
  }

  protected async clear(): Promise<void> {
    await this.write(null);
  }

  private async write(contactPhone: string | null): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      const contact = await firstValueFrom(
        this.http.patch<EventContact>(`${this.apiBaseUrl}/events/${this.eventId}/contact`, {
          contactPhone,
        }),
      );

      // El valor guardado es el normalizado por el borde, no lo que se escribió.
      this.saved.set(contact.contactPhone);
      this.input.set(contact.contactPhone ?? '');
    } catch (error: unknown) {
      this.error.set(writeMessage(apiErrorCode(error)));
    } finally {
      this.saving.set(false);
    }
  }
}
