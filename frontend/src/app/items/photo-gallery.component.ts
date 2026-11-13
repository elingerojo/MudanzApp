import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CAPTURE_LIMITS, ITEM_PHOTO_CONTENT_TYPES, orderControlsVisible } from '@mudanzapp/shared';

import { ItemPhotoComponent } from './item-photo.component';

/**
 * Una foto de la tira: la que ya existe en el servidor (`photoId`) o la que aún vive en el
 * dispositivo (`previewUrl` mientras se optimiza o antes de adjuntarse).
 */
export interface GalleryPhoto {
  /** Llave estable para el `track`: el id de la foto o el de su archivo en la sesión. */
  readonly key: string;
  /** Foto ya guardada; se pinta pidiendo su miniatura con la sesión del evento. */
  readonly photoId: string | null;
  /** Vista previa de una foto que todavía no está en el servidor. */
  readonly previewUrl: string | null;
  /** Aún se está optimizando en el dispositivo. */
  readonly pending: boolean;
}

/**
 * La tira de fotos compartida por la captura y la edición (`plan-ciclo-3e` §5; lectura del borrador
 * desde 3i).
 *
 * Publica la galería, no la decide: las dos entradas —`Tomar foto` con la cámara y `Elegir de la
 * galería` con selección múltiple— solo emiten los archivos, y los controles de subir y bajar solo
 * emiten el movimiento. El estado, el tope y el orden viven en quien la monta.
 *
 * Cuatro reglas que la pieza no negocia:
 * - la primera foto se marca `Portada` y la leyenda dice qué significa, sin un tour que explicarlo;
 * - el contador es `n de 6`, nunca un porcentaje;
 * - con una sola foto **no** se renderizan los controles de orden: la regla viene de `shared` y es la
 *   misma en las dos superficies;
 * - el borrador **se nombra, el nivel no**: con `draftMax` la tira dice cuántas fotos va a leer el
 *   modelo y, si el máximo no alcanza la galería, cuáles son (`plan-ciclo-3i` §5). Sin `draftMax` —la
 *   edición— la tira no habla de la IA.
 */
@Component({
  selector: 'app-photo-gallery',
  imports: [ItemPhotoComponent],
  templateUrl: './photo-gallery.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoGalleryComponent {
  readonly photos = input.required<readonly GalleryPhoto[]>();
  readonly max = input<number>(CAPTURE_LIMITS.photos);
  readonly legend = input<string>('La primera foto abre la ficha y alimenta el borrador');
  /**
   * Fotos que el borrador lee en este evento. `0` apaga el contador y la línea: la tira de la
   * edición no tiene borrador que explicar.
   */
  readonly draftMax = input<number>(0);
  readonly cameraLabel = input<string>('Tomar foto');
  readonly chooseLabel = input<string>('Elegir de la galería');
  /** Clases de los dos botones de entrada: la promoción de 3k las decide quien monta la tira. */
  readonly actionClasses = input<string>('');
  readonly disabled = input<boolean>(false);

  /** Archivos elegidos o tomados; el dueño los deposita en la sesión de captura. */
  readonly picked = output<readonly File[]>();

  /** Un movimiento de la tira; el dueño decide si es orden de captura o de publicación. */
  readonly moved = output<{ readonly index: number; readonly direction: -1 | 1 }>();

  protected readonly accept = ITEM_PHOTO_CONTENT_TYPES.join(',');
  protected readonly orderVisible = orderControlsVisible;

  /**
   * `2 de 3 fotos al borrador`: cuántas lee **de las que hay**. El denominador es la galería, no el
   * tope, porque lo que la persona necesita saber es qué parte de su tira va a mirar el modelo. Con
   * una sola foto no aparece: no hay nada que explicar y sería ruido (`plan-ciclo-3i` §5).
   */
  protected readonly draftCountLabel = computed<string | null>(() => {
    const max = this.draftMax();
    const total = this.photos().length;
    if (max < 1 || total < 2) {
      return null;
    }

    return `${String(Math.min(total, max))} de ${String(total)} fotos al borrador`;
  });

  /**
   * La capacidad se nombra cuando recorta: `El borrador usa hasta 2 fotos: las 2 primeras.` Sin la
   * palabra «nivel», sin modal y sin globo (`plan-ciclo-3i` §5).
   */
  protected readonly draftCapLine = computed<string | null>(() => {
    const max = this.draftMax();
    const total = this.photos().length;
    if (max < 1 || max >= total) {
      return null;
    }

    return max === 1
      ? 'El borrador usa hasta 1 foto: la primera.'
      : `El borrador usa hasta ${String(max)} fotos: las ${String(max)} primeras.`;
  });

  protected onCamera(event: Event): void {
    this.emit(event);
  }

  protected onLibrary(event: Event): void {
    this.emit(event);
  }

  protected move(index: number, direction: -1 | 1): void {
    if (this.disabled()) {
      return;
    }

    this.moved.emit({ index, direction });
  }

  private emit(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length > 0) {
      this.picked.emit(files);
    }
  }
}
