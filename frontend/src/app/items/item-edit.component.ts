import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ITEM_LIMITS,
  parsePriceInput,
  priceInputValue,
  type ItemSummary,
  type UpdatedItem,
  type UpdateItemRequest,
} from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import { EventItemsStore } from '../events/event-items.store';
import { ITEM_NOT_FOUND, apiErrorCode } from '../session/api-error';
import { uiButtonClasses } from '../ui/ui-button/ui-button';
import { UiCardComponent } from '../ui/ui-card/ui-card';
import { ItemPhotoComponent } from './item-photo.component';

/** Medida opcional: vacía es ausencia; un valor que no es un número positivo es un error. */
function parseMeasure(raw: string, label: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} debe ser un número positivo.`);
  }

  return value;
}

/**
 * Página de edición de `Capturados` (ciclo 4b, `item-edit`).
 *
 * Cualquier sesión del evento corrige título, nota, medidas y precio; el `slug` publicado no cambia
 * (decisión §31). La foto no se reemplaza en este corte: se muestra para reconocer la ficha. Vender
 * es un acto distinto y vive en `Capturados`, no aquí (decisión §40).
 */
@Component({
  selector: 'app-item-edit',
  imports: [ItemPhotoComponent, RouterLink, UiCardComponent],
  templateUrl: './item-edit.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemEditComponent {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly store = inject(EventItemsStore);

  protected readonly itemId = this.route.snapshot.paramMap.get('itemId') ?? '';

  private readonly resource = httpResource<{ readonly item: ItemSummary }>(() => {
    const eventId = this.store.eventId();
    return this.itemId.length === 0 || eventId.length === 0
      ? undefined
      : `${this.apiBaseUrl}/events/${eventId}/items/${this.itemId}`;
  });

  protected readonly loading = this.resource.isLoading;

  protected readonly item = computed<ItemSummary | null>(() =>
    this.resource.status() === 'resolved' ? (this.resource.value()?.item ?? null) : null,
  );

  protected readonly failed = computed(() => this.resource.status() === 'error');

  protected readonly title = signal('');
  protected readonly note = signal('');
  protected readonly widthCm = signal('');
  protected readonly heightCm = signal('');
  protected readonly depthCm = signal('');
  protected readonly weightKg = signal('');
  protected readonly price = signal('');

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly primaryClasses = uiButtonClasses('primary');
  protected readonly secondaryClasses = uiButtonClasses('secondary');

  protected readonly maxPriceCents = ITEM_LIMITS.priceCents;

  private readonly prefilled = signal(false);

  protected readonly canSave = computed(
    () => this.item() !== null && this.title().trim().length > 0 && !this.saving(),
  );

  constructor() {
    // La primera lectura rellena los campos una sola vez: una recarga del recurso no pisa lo que la
    // persona ya escribió.
    effect(() => {
      const item = this.item();
      if (item === null || this.prefilled()) {
        return;
      }

      this.title.set(item.title);
      this.note.set(item.note ?? '');
      this.widthCm.set(item.widthCm === null ? '' : String(item.widthCm));
      this.heightCm.set(item.heightCm === null ? '' : String(item.heightCm));
      this.depthCm.set(item.depthCm === null ? '' : String(item.depthCm));
      this.weightKg.set(item.weightKg === null ? '' : String(item.weightKg));
      this.price.set(priceInputValue(item.priceCents));
      this.prefilled.set(true);
    });
  }

  protected onInput(
    target: 'title' | 'note' | 'price' | 'widthCm' | 'heightCm' | 'depthCm' | 'weightKg',
  ) {
    return (event: Event): void => {
      const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
      this[target].set(value);
    };
  }

  protected save(event: Event): void {
    event.preventDefault();
    void this.send();
  }

  private async send(): Promise<void> {
    if (this.saving()) {
      return;
    }

    const body = this.buildBody();
    if (body === null) {
      return;
    }

    const eventId = this.store.eventId();
    if (eventId.length === 0) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(
        this.http.patch<UpdatedItem>(
          `${this.apiBaseUrl}/events/${eventId}/items/${this.itemId}`,
          body,
        ),
      );

      this.store.reload();
      await this.router.navigate(['/capturados']);
    } catch (error: unknown) {
      this.error.set(
        apiErrorCode(error) === ITEM_NOT_FOUND
          ? 'Este artículo ya no existe en el evento.'
          : 'No se pudo guardar la ficha. Inténtalo de nuevo.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  /** Construye el cuerpo o deja el mensaje de la ficha. `null` significa «no envíes». */
  private buildBody(): UpdateItemRequest | null {
    const title = this.title().trim();
    if (title.length === 0) {
      this.error.set('El artículo necesita un título.');
      return null;
    }

    const parsedPrice = parsePriceInput(this.price());
    if (!parsedPrice.ok) {
      this.error.set('El precio debe ser un número positivo con hasta dos decimales.');
      return null;
    }

    try {
      const note = this.note().trim();

      return {
        title,
        note: note.length === 0 ? null : note,
        widthCm: parseMeasure(this.widthCm(), 'El ancho'),
        heightCm: parseMeasure(this.heightCm(), 'El alto'),
        depthCm: parseMeasure(this.depthCm(), 'El fondo'),
        weightKg: parseMeasure(this.weightKg(), 'El peso'),
        priceCents: parsedPrice.cents,
      };
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Revisa las medidas de la ficha.');
      return null;
    }
  }
}
