import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import {
  ITEM_LIMITS,
  ITEM_PHOTO_CONTENT_TYPES,
  type CreateItemRequest,
  type CreatedItem,
} from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import { PHOTO_INVALID, apiErrorCode } from '../session/api-error';
import { uiButtonClasses } from '../ui/ui-button/ui-button';

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
 * Captura de un artículo: foto y datos mínimos (`capture`, ciclo 3a).
 *
 * La foto se elige con un `<label for>` sobre el input de archivo, no con un botón: solo un label lo
 * activa de forma nativa y es lo que abre la cámara en el móvil. Se valida el tipo y el tamaño en el
 * cliente para no subir un archivo que el servidor va a rechazar, y se vuelve a validar en la
 * frontera porque el cliente no es la regla.
 *
 * Dos peticiones en orden: primero la ficha, después la foto. Si la foto falla, el artículo queda
 * creado y el usuario puede reintentar con otra, en vez de perder lo escrito.
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
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly primaryClasses = uiButtonClasses('primary');
  protected readonly secondaryClasses = uiButtonClasses('secondary');

  private objectUrl: string | null = null;

  protected onInput(target: 'title' | 'note' | 'widthCm' | 'heightCm' | 'depthCm' | 'weightKg') {
    return (event: Event): void => {
      const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
      this[target].set(value);
    };
  }

  /**
   * Acepta la foto elegida y la previsualiza. Un archivo rechazado no reemplaza al que ya estaba:
   * el mensaje explica el motivo y la captura sigue siendo válida.
   */
  protected onPhoto(event: Event): void {
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

    if (file.size > ITEM_LIMITS.photoBytes) {
      this.error.set(`La foto supera el límite de ${String(this.maxPhotoMiB)} MB.`);
      input.value = '';
      return;
    }

    this.error.set(null);
    this.photo.set(file);
    this.replacePreview(file);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();

    if (this.saving()) {
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

      const photo = this.photo();
      if (photo !== null) {
        await firstValueFrom(
          this.http.put<{ readonly photo: { readonly id: string } }>(
            `${this.apiBaseUrl}/events/${this.eventId()}/items/${created.item.id}/photo`,
            photo,
            { headers: { 'Content-Type': photo.type } },
          ),
        );
      }

      this.reset();
      this.created.emit();
    } catch (error: unknown) {
      this.error.set(
        apiErrorCode(error) === PHOTO_INVALID
          ? 'El servidor rechazó la foto. Prueba con otra imagen más pequeña.'
          : 'No se pudo guardar el artículo. Inténtalo de nuevo.',
      );
    } finally {
      this.saving.set(false);
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

  private replacePreview(file: File): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
    }

    try {
      this.objectUrl = URL.createObjectURL(file);
      this.preview.set(this.objectUrl);
    } catch {
      // Sin vista previa la captura sigue sirviendo: el archivo ya está elegido.
      this.objectUrl = null;
      this.preview.set(null);
    }
  }

  private reset(): void {
    this.title.set('');
    this.note.set('');
    this.widthCm.set('');
    this.heightCm.set('');
    this.depthCm.set('');
    this.weightKg.set('');
    this.photo.set(null);
    this.replacePreviewReset();
    this.error.set(null);
  }

  private replacePreviewReset(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.preview.set(null);
  }
}
