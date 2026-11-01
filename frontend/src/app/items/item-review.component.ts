import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { AiDraftResult, ItemSummary } from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import {
  AI_NOT_CONFIGURED,
  AI_OUTPUT_INVALID,
  AI_UNAVAILABLE,
  ITEM_PHOTO_MISSING,
  apiErrorCode,
} from '../session/api-error';
import { uiButtonClasses } from '../ui/ui-button/ui-button';

/** Fallo al pedir el borrador, ramificado por `code` y nunca por el mensaje del borde. */
function draftMessage(code: string | null): string {
  switch (code) {
    case ITEM_PHOTO_MISSING:
      return 'Este artículo todavía no tiene foto, y el borrador necesita una.';
    case AI_NOT_CONFIGURED:
      return 'La IA no está configurada en este entorno. Escribe la ficha a mano.';
    case AI_OUTPUT_INVALID:
      return 'La IA devolvió una ficha que no se puede usar. Revísala y escríbela a mano.';
    case AI_UNAVAILABLE:
    default:
      return 'La IA no respondió. Escribe la ficha a mano y guárdala igual.';
  }
}

/** Fallo al guardar la revisión: mismo criterio, códigos del catálogo del borde. */
function saveMessage(code: string | null): string {
  return code === 'validation_failed'
    ? 'Revisa los campos: hay algo que el servidor no aceptó.'
    : 'No se pudo guardar la ficha. Inténtalo de nuevo.';
}

/**
 * Revisión de una ficha ya capturada (`ai-draft`, ciclo 3d).
 *
 * La hipótesis del ciclo es que **la ficha se revisa en vez de escribirse**: el borrador no es
 * estado y no se persiste, y solo lo que el humano deja escrito llega al `PATCH`. Por eso el
 * formulario arranca vacío —la ficha guardada se muestra arriba como contexto— y el borrador solo
 * rellena los campos **vacíos**: si el humano ya escribió, no se sobrescribe y el aviso lo explica.
 *
 * Si la IA falla, la pantalla sigue siendo usable: el mensaje llega por `code` y la revisión manual
 * sigue disponible (`05` §2). La compuerta del producto no depende de un tercero.
 */
@Component({
  selector: 'app-item-review',
  templateUrl: './item-review.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemReviewComponent {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  readonly eventId = input.required<string>();
  readonly item = input.required<ItemSummary>();

  /** La ficha aprobada se guardó: el padre recarga la lista y cierra la revisión. */
  readonly saved = output<void>();
  readonly closed = output<void>();

  protected readonly title = signal('');
  protected readonly note = signal('');
  protected readonly drafting = signal(false);
  protected readonly saving = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly busy = computed(() => this.drafting() || this.saving());

  /** Sin título no hay ficha: es la misma regla del artículo y del esquema del `PATCH`. */
  protected readonly canSave = computed(() => this.title().trim().length > 0 && !this.busy());

  protected readonly primaryClasses = uiButtonClasses('primary');
  protected readonly secondaryClasses = uiButtonClasses('secondary');

  protected onTitle(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
  }

  protected onNote(event: Event): void {
    this.note.set((event.target as HTMLTextAreaElement).value);
  }

  /** Pide el borrador y rellena **solo** lo que el humano no haya escrito ya. */
  protected async draft(): Promise<void> {
    if (this.busy()) {
      return;
    }

    this.drafting.set(true);
    this.error.set(null);
    this.notice.set(null);

    try {
      const result = await firstValueFrom(
        this.http.post<AiDraftResult>(
          `${this.apiBaseUrl}/events/${this.eventId()}/items/${this.item().id}/draft`,
          {},
        ),
      );

      const wroteTitle = this.title().trim().length > 0;
      const wroteNote = this.note().trim().length > 0;
      if (!wroteTitle) {
        this.title.set(result.draft.title);
      }
      if (!wroteNote) {
        this.note.set(result.draft.note);
      }

      this.notice.set(
        wroteTitle || wroteNote
          ? 'Borrador de la IA: revísalo antes de guardar. Ya habías escrito parte de la ficha, así que se respetó lo tuyo.'
          : 'Borrador de la IA: revísalo antes de guardar.',
      );
    } catch (error: unknown) {
      this.error.set(draftMessage(apiErrorCode(error)));
    } finally {
      this.drafting.set(false);
    }
  }

  /** Guarda exactamente lo que el humano dejó: la nota viaja siempre para poder limpiarla. */
  protected async save(event: Event): Promise<void> {
    event.preventDefault();

    if (!this.canSave()) {
      this.error.set('Escribe un título antes de guardar.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(
        this.http.patch<{ readonly item: ItemSummary }>(
          `${this.apiBaseUrl}/events/${this.eventId()}/items/${this.item().id}`,
          { title: this.title().trim(), note: this.note().trim() },
        ),
      );

      this.saved.emit();
    } catch (error: unknown) {
      this.error.set(saveMessage(apiErrorCode(error)));
    } finally {
      this.saving.set(false);
    }
  }
}
