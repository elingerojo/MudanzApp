import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CAPTURE_LIMITS,
  ITEM_LIMITS,
  ITEM_PHOTO_CONTENT_TYPES,
  parsePriceInput,
  priceInputValue,
  type AttachedPhotos,
  type ItemPhoto,
  type ItemSummary,
  type UpdatedItem,
  type UpdateItemRequest,
} from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import { EventItemsStore } from '../events/event-items.store';
import {
  ITEM_NOT_FOUND,
  ITEM_SOLD,
  PHOTO_INVALID,
  PHOTO_ORDER_MISMATCH,
  apiErrorCode,
} from '../session/api-error';
import { uiButtonClasses } from '../ui/ui-button/ui-button';
import { UiCardComponent } from '../ui/ui-card/ui-card';
import { PhotoGalleryComponent, type GalleryPhoto } from './photo-gallery.component';
import { PhotoPipeline } from './photo-pipeline';

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

/** Mensaje del orden de publicación, ramificado por `code` y nunca por el texto del borde. */
function orderMessage(code: string | null): string {
  if (code === PHOTO_ORDER_MISMATCH) {
    return 'La galería cambió en otro dispositivo. Recarga para ver las fotos vigentes.';
  }

  if (code === ITEM_SOLD) {
    return 'Un artículo vendido no cambia su galería.';
  }

  return 'No se pudo guardar el orden. Inténtalo de nuevo.';
}

/** Mensaje de la subida de fotos nuevas: un rechazo del borde tiene su propia frase. */
function attachMessage(code: string | null): string {
  if (code === PHOTO_INVALID) {
    return 'El servidor rechazó alguna foto. Vuelve a elegirla e inténtalo de nuevo.';
  }

  if (code === ITEM_SOLD) {
    return 'Un artículo vendido no acepta cambios de galería.';
  }

  return 'No se pudieron subir las fotos. Inténtalo de nuevo.';
}

/**
 * Página de edición de `Capturados` (ciclo 4b, `item-edit`; galería desde 3e).
 *
 * Cualquier sesión del evento corrige título, nota, medidas y precio; el `slug` publicado no cambia
 * (decisión §31). Desde 3e esta pantalla **añade fotos y cambia el orden de publicación**: aquí el
 * orden no alimenta ningún borrador —ese se pide durante la captura y lee la portada de ese
 * momento—, y la línea de la tira lo dice sin vocabulario de IA. Un artículo vendido queda congelado.
 *
 * Vender es un acto distinto y vive en `Capturados`, no aquí (decisión §40).
 */
@Component({
  selector: 'app-item-edit',
  imports: [PhotoGalleryComponent, RouterLink, UiCardComponent],
  templateUrl: './item-edit.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemEditComponent {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pipeline = inject(PhotoPipeline);
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
  protected readonly notice = signal<string | null>(null);

  /** El orden de publicación que se está viendo; la primera foto es la portada. */
  protected readonly order = signal<readonly ItemPhoto[]>([]);

  /** Una permutación está en vuelo: los controles no se repiten. */
  protected readonly ordering = signal(false);

  /** Fotos nuevas subiéndose: la tira no acepta más hasta que la tanda termine. */
  protected readonly adding = signal(false);

  protected readonly progress = signal<number | null>(null);

  protected readonly maxPhotos = CAPTURE_LIMITS.photos;
  protected readonly maxPhotoMiB = ITEM_LIMITS.photoBytes / (1024 * 1024);

  protected readonly primaryClasses = uiButtonClasses('primary');
  protected readonly secondaryClasses = uiButtonClasses('secondary');

  protected readonly maxPriceCents = ITEM_LIMITS.priceCents;

  private readonly prefilled = signal(false);

  protected readonly canSave = computed(
    () => this.item() !== null && this.title().trim().length > 0 && !this.saving(),
  );

  /** La galería de un artículo vendido está congelada: ni añadir ni reordenar. */
  protected readonly galleryDisabled = computed(
    () => this.adding() || this.ordering() || this.item()?.soldAt != null,
  );

  /** La tira: las fotos del servidor en el orden que la persona está construyendo. */
  protected readonly galleryPhotos = computed<readonly GalleryPhoto[]>(() =>
    this.order().map((photo) => ({
      key: photo.id,
      photoId: photo.id,
      previewUrl: null,
      pending: false,
    })),
  );

  constructor() {
    // La primera lectura siembra los campos y la tira una sola vez: reordenar no se pisa con la
    // respuesta del recurso.
    effect(() => {
      const item = this.item();
      if (item === null) {
        return;
      }

      untracked(() => {
        if (this.prefilled()) {
          return;
        }

        this.title.set(item.title);
        this.note.set(item.note ?? '');
        this.widthCm.set(item.widthCm === null ? '' : String(item.widthCm));
        this.heightCm.set(item.heightCm === null ? '' : String(item.heightCm));
        this.depthCm.set(item.depthCm === null ? '' : String(item.depthCm));
        this.weightKg.set(item.weightKg === null ? '' : String(item.weightKg));
        this.price.set(priceInputValue(item.priceCents));
        this.order.set(item.photos);
        this.prefilled.set(true);
      });
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

  /** Añade fotos al final de la galería; solo entran al orden de publicación, nunca al borrador. */
  protected async onPicked(files: readonly File[]): Promise<void> {
    const item = this.item();
    if (item === null || this.adding()) {
      return;
    }

    if (item.soldAt !== null) {
      this.error.set('Un artículo vendido no acepta cambios de galería.');
      return;
    }

    const room = this.maxPhotos - this.order().length;
    if (room <= 0) {
      this.error.set(`La galería admite ${String(this.maxPhotos)} fotos.`);
      return;
    }

    const accepted = files.slice(0, room);
    this.adding.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.progress.set(0);

    try {
      const uploads = [];
      const baseSlot = this.order().length;

      for (const [index, file] of accepted.entries()) {
        const typeAccepted = (ITEM_PHOTO_CONTENT_TYPES as readonly string[]).includes(file.type);
        if (!typeAccepted) {
          throw new Error('photo-type');
        }

        if (file.size > ITEM_LIMITS.photoBytes) {
          throw new Error('photo-size');
        }

        const optimized = await this.pipeline.optimize(file);
        uploads.push({ optimized, slot: baseSlot + index, ticket: null });
      }

      const attached = await this.pipeline.attach({
        eventId: this.store.eventId(),
        itemId: this.itemId,
        photos: uploads,
        onProgress: (percent) => {
          this.progress.set(percent);
        },
      });

      this.order.update((current) => [...current, ...attached]);
      this.store.reload();
    } catch (error: unknown) {
      this.error.set(attachMessage(apiErrorCode(error)));
    } finally {
      this.adding.set(false);
      this.progress.set(null);
    }
  }

  /**
   * Reordena la tira y guarda el **orden de publicación**. La primera foto es la portada que la lista
   * y la ficha pública usan; el borrador de la captura no se reescribe.
   */
  protected move(event: { readonly index: number; readonly direction: -1 | 1 }): void {
    const current = [...this.order()];
    const target = event.index + event.direction;
    if (target < 0 || target >= current.length || this.ordering()) {
      return;
    }

    const [moved] = current.splice(event.index, 1);
    if (moved === undefined) {
      return;
    }

    current.splice(target, 0, moved);
    this.order.set(current);
    void this.saveOrder();
  }

  private async saveOrder(): Promise<void> {
    const item = this.item();
    if (item === null || item.soldAt !== null) {
      this.error.set('Un artículo vendido no cambia su galería.');
      return;
    }

    const photoIds = this.order().map((photo) => photo.id);
    if (photoIds.length < 2) {
      // Una permutación de una foto no es un acto: no se llama a la ruta.
      return;
    }

    this.ordering.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.put<AttachedPhotos>(
          `${this.apiBaseUrl}/events/${this.store.eventId()}/items/${this.itemId}/photos/order`,
          { photoIds },
        ),
      );

      this.order.set(response.photos);
      this.store.reload();
      this.notice.set('Orden de publicación guardado.');
    } catch (error: unknown) {
      this.error.set(orderMessage(apiErrorCode(error)));
    } finally {
      this.ordering.set(false);
    }
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
