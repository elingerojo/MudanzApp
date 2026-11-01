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
import {
  ITEM_LIMITS,
  ITEM_PHOTO_CONTENT_TYPES,
  ITEM_PHOTO_VARIANTS,
  type CreateItemRequest,
  type CreatedItem,
  type ItemPhotoVariant,
} from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import { PHOTO_INVALID, apiErrorCode } from '../session/api-error';
import { uiButtonClasses } from '../ui/ui-button/ui-button';
import { sizeLabel } from './photo-encoding';
import { optimizePhoto, type OptimizedPhoto } from './photo-optimizer';

/** Error de la ficha, para distinguirlo de un fallo de red al capturarlo. */
class DraftError extends Error {}

/**
 * Medida opcional: vacía es ausencia; un valor que no es un número positivo es un error de la
 * ficha, no una ausencia silenciosa.
 */
function parseMeasure(raw: string, label: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    throw new DraftError(`${label} debe ser un número positivo.`);
  }

  return value;
}

/** Tipos admitidos para el `accept` del input; la lista vive en el contrato compartido. */
const ACCEPT_ATTRIBUTE = ITEM_PHOTO_CONTENT_TYPES.join(',');

/**
 * Orden de subida: de mayor a menor, para que `large` cree la foto y las otras dos solo añadan su
 * fila (`plan-ciclo-3c-optimizar` §5).
 */
const UPLOAD_ORDER: readonly ItemPhotoVariant[] = ['large', 'medium', 'thumb'];

/** Fila de la tarjeta de pesos: dimensiones y peso reales de la variante que el dispositivo produjo. */
interface SizeEntry {
  readonly variant: ItemPhotoVariant;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly byteSize: number;
  readonly label: string;
}

/**
 * Captura de un artículo: foto y datos mínimos (`capture`, ciclo 3a; optimizada en el dispositivo
 * desde 3c-optimizar).
 *
 * La foto se elige con un `<label for>` sobre el input de archivo, no con un botón: solo un label lo
 * activa de forma nativa y es lo que abre la cámara en el móvil. Al elegirla se **optimiza**, no al
 * guardar: la original se decodifica y se reescribe en tres tamaños dentro del teléfono, y el
 * formulario muestra el resultado antes de enviarlo.
 *
 * Tres peticiones después de la ficha, una por tamaño. Si una falla, el artículo queda creado y el
 * usuario puede reintentar con otra, en vez de perder lo escrito.
 */
@Component({
  selector: 'app-item-form',
  templateUrl: './item-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemFormComponent {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  readonly eventId = input.required<string>();
  readonly created = output<void>();

  protected readonly accept = ACCEPT_ATTRIBUTE;
  protected readonly maxPhotoMiB = ITEM_LIMITS.photoBytes / (1024 * 1024);

  protected readonly title = signal('');
  protected readonly note = signal('');
  protected readonly widthCm = signal('');
  protected readonly heightCm = signal('');
  protected readonly depthCm = signal('');
  protected readonly weightKg = signal('');

  protected readonly photo = signal<File | null>(null);
  protected readonly preview = signal<string | null>(null);
  protected readonly sizes = signal<readonly SizeEntry[]>([]);
  protected readonly optimizing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = computed(() => this.saving() || this.optimizing());

  protected readonly primaryClasses = uiButtonClasses('primary');
  protected readonly secondaryClasses = uiButtonClasses('secondary');

  /** Lo que viaja: los tres blobs ya optimizados. El peso no se envía como dato. */
  private optimized: readonly OptimizedPhoto[] = [];
  private objectUrl: string | null = null;

  protected onInput(target: 'title' | 'note' | 'widthCm' | 'heightCm' | 'depthCm' | 'weightKg') {
    return (event: Event): void => {
      const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
      this[target].set(value);
    };
  }

  /**
   * Acepta la foto elegida, la optimiza en el dispositivo y la previsualiza. Un archivo rechazado no
   * reemplaza al que ya estaba: el mensaje explica el motivo y la captura sigue siendo válida.
   */
  protected async onPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const [file] = Array.from(input.files ?? []);
    if (file === undefined) {
      return;
    }

    const typeAccepted = (ITEM_PHOTO_CONTENT_TYPES as readonly string[]).includes(file.type);
    if (!typeAccepted) {
      this.error.set('La foto debe ser JPEG, PNG o WebP.');
      input.value = '';
      return;
    }

    // El tope es del **archivo de la cámara**, no de lo que viaja: la original nunca sale del
    // dispositivo. Un archivo mayor se rechaza aquí, sin tocar la red.
    if (file.size > ITEM_LIMITS.photoBytes) {
      this.error.set(`La foto supera el límite de ${String(this.maxPhotoMiB)} MB.`);
      input.value = '';
      return;
    }

    this.error.set(null);
    this.optimizing.set(true);

    try {
      const optimized = await optimizePhoto(file);

      this.optimized = optimized;
      this.photo.set(file);
      this.sizes.set(
        optimized.map((entry) => ({
          variant: entry.variant,
          widthPx: entry.widthPx,
          heightPx: entry.heightPx,
          byteSize: entry.blob.size,
          label: sizeLabel(entry, entry.blob.size),
        })),
      );
      this.replacePreview(optimized);
    } catch {
      this.clearPhoto();
      input.value = '';
      this.error.set('No se pudo procesar esta foto. Elige otra o toma una nueva.');
    } finally {
      this.optimizing.set(false);
    }
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();

    if (this.busy()) {
      return;
    }

    const body = this.buildBody();
    if (body === null) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      const created = await firstValueFrom(
        this.http.post<CreatedItem>(`${this.apiBaseUrl}/events/${this.eventId()}/items`, body),
      );

      await this.uploadVariants(created.item.id);

      this.reset();
      this.created.emit();
    } catch (error: unknown) {
      this.error.set(
        apiErrorCode(error) === PHOTO_INVALID
          ? 'El servidor rechazó la foto. Vuelve a elegirla e inténtalo de nuevo.'
          : 'No se pudo guardar el artículo. Inténtalo de nuevo.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Sube los tres tamaños en orden `large`, `medium`, `thumb`, cada uno con la variante y sus
   * dimensiones reales en la URL. El tipo va en la cabecera, tal como lo produjo el codificador.
   */
  private async uploadVariants(itemId: string): Promise<void> {
    for (const variant of UPLOAD_ORDER) {
      const entry = this.optimized.find((candidate) => candidate.variant === variant);
      if (entry === undefined) {
        continue;
      }

      await firstValueFrom(
        this.http.put<{ readonly photo: unknown }>(
          `${this.apiBaseUrl}/events/${this.eventId()}/items/${itemId}/photo` +
            `?variant=${variant}&w=${String(entry.widthPx)}&h=${String(entry.heightPx)}`,
          entry.blob,
          { headers: { 'Content-Type': entry.blob.type } },
        ),
      );
    }
  }

  /** Construye el cuerpo o deja el mensaje de la ficha. `null` significa «no envíes». */
  private buildBody(): CreateItemRequest | null {
    const title = this.title().trim();
    if (title.length === 0) {
      this.error.set('El artículo necesita un título.');
      return null;
    }

    try {
      const note = this.note().trim();
      const widthCm = parseMeasure(this.widthCm(), 'El ancho');
      const heightCm = parseMeasure(this.heightCm(), 'El alto');
      const depthCm = parseMeasure(this.depthCm(), 'El fondo');
      const weightKg = parseMeasure(this.weightKg(), 'El peso');

      return {
        title,
        ...(note.length > 0 ? { note } : {}),
        ...(widthCm === null ? {} : { widthCm }),
        ...(heightCm === null ? {} : { heightCm }),
        ...(depthCm === null ? {} : { depthCm }),
        ...(weightKg === null ? {} : { weightKg }),
      };
    } catch (error: unknown) {
      if (error instanceof DraftError) {
        this.error.set(error.message);
        return null;
      }
      throw error;
    }
  }

  /**
   * Vista previa de la **mediana**, que es el tamaño que se ve en la mayoría de los casos. Se pinta
   * desde el blob optimizado, no desde la original: lo que el usuario ve es lo que se guarda.
   */
  private replacePreview(optimized: readonly OptimizedPhoto[]): void {
    const medium =
      optimized.find((entry) => entry.variant === 'medium') ??
      optimized.find((entry) => entry.variant === ITEM_PHOTO_VARIANTS[0]);

    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
    }

    if (medium === undefined) {
      this.objectUrl = null;
      this.preview.set(null);
      return;
    }

    try {
      this.objectUrl = URL.createObjectURL(medium.blob);
      this.preview.set(this.objectUrl);
    } catch {
      // Sin vista previa la captura sigue sirviendo: la foto ya está optimizada.
      this.objectUrl = null;
      this.preview.set(null);
    }
  }

  private clearPhoto(): void {
    this.optimized = [];
    this.photo.set(null);
    this.sizes.set([]);
    this.releasePreview();
  }

  private releasePreview(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.preview.set(null);
  }

  private reset(): void {
    this.title.set('');
    this.note.set('');
    this.widthCm.set('');
    this.heightCm.set('');
    this.depthCm.set('');
    this.weightKg.set('');
    this.clearPhoto();
    this.error.set(null);
  }
}
