import { Injectable, computed, signal } from '@angular/core';
import { CAPTURE_LIMITS } from '@mudanzapp/shared';

/**
 * Sesión de captura en memoria (cortes D12 y D13; lista ordenada desde 3e).
 *
 * La shell y la pantalla de bienvenida tienen el input de cámara —así el acto de tomar la foto vive
 * fuera del panel— y el panel de captura sigue siendo el dueño de la optimización, el ticket y los
 * mensajes. Este store es la costura entre los dos y, desde D13, **la sesión completa**: las fotos
 * sobreviven a entrar y salir del panel y solo se terminan al guardar, al publicar o al cerrar la
 * sesión.
 *
 * Reglas:
 *
 * - **Lista ordenada**: desde 3e la sesión es la galería, y el índice 0 es la portada que abre el
 *   borrador. Añadir fotos las pone al final; mover cambia el orden sin perder ninguna.
 * - `peek` no consume nada; `clear` es el único final de la sesión.
 * - Vive en memoria y muere con la pestaña. No se serializa ni se escribe en disco (X8).
 * - No valida tipo ni tamaño: esa regla vive en el formulario y dos validaciones divergen.
 */
@Injectable({ providedIn: 'root' })
export class PhotoInboxStore {
  private readonly list = signal<readonly File[]>([]);

  /** Las fotos en curso, en el orden de captura; vacío es «sin captura viva». */
  readonly photos = this.list.asReadonly();

  /** Cuántas hay: el contador `n de 6` de la tira. */
  readonly count = computed(() => this.list().length);

  /** La barra usa esta señal para habilitar `Captura`. */
  readonly hasPhoto = computed(() => this.list().length > 0);

  /** ¿La galería alcanzó el tope duro de 6? El tope es de toda la aplicación y no se configura. */
  readonly full = computed(() => this.list().length >= CAPTURE_LIMITS.photos);

  /** La portada: la primera foto del orden de captura. */
  readonly cover = computed<File | null>(() => this.list()[0] ?? null);

  /** Añade al final, respetando el tope. Una selección vacía no hace nada. */
  addFiles(files: readonly File[]): void {
    if (files.length === 0) {
      return;
    }

    const next = [...this.list(), ...files].slice(0, CAPTURE_LIMITS.photos);
    this.list.set(next);
  }

  /** Mueve una foto una posición; en los extremos no hace nada. */
  move(index: number, direction: -1 | 1): void {
    const current = [...this.list()];
    const target = index + direction;
    if (index < 0 || index >= current.length || target < 0 || target >= current.length) {
      return;
    }

    const [moved] = current.splice(index, 1);
    if (moved === undefined) {
      return;
    }

    current.splice(target, 0, moved);
    this.list.set(current);
  }

  /** Quita una foto rechazada sin tocar el resto de la tira. */
  remove(file: File): void {
    const next = this.list().filter((entry) => entry !== file);
    if (next.length !== this.list().length) {
      this.list.set(next);
    }
  }

  /** Devuelve las fotos vigentes **sin consumirlas**: volver al panel las reutiliza. */
  peek(): readonly File[] {
    return this.list();
  }

  /** Termina la sesión: guardar, publicar o cerrar sesión. */
  clear(): void {
    this.list.set([]);
  }
}
