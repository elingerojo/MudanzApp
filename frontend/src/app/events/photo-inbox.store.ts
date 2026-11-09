import { Injectable, computed, signal } from '@angular/core';

/**
 * Sesión de captura en memoria (cortes D12 y D13).
 *
 * La shell y la pantalla de bienvenida tienen el input de cámara —así el acto de tomar la foto vive
 * fuera del panel— y el panel de captura sigue siendo el dueño de la optimización, el ticket y los
 * mensajes. Este store es la costura entre los dos y, desde D13, **la sesión completa**: la foto
 * sobrevive a entrar y salir del panel y solo se termina al guardar, al publicar o al cerrar la
 * sesión.
 *
 * Reglas:
 *
 * - Una sola foto: retomar reemplaza la vigente.
 * - `peek` no consume nada; `clear` es el único final de la sesión.
 * - Vive en memoria y muere con la pestaña. No se serializa ni se escribe en disco (X8).
 * - No valida tipo ni tamaño: esa regla vive en el formulario y dos validaciones divergen.
 */
@Injectable({ providedIn: 'root' })
export class PhotoInboxStore {
  private readonly slot = signal<File | null>(null);

  /** La foto en curso, o `null` cuando no hay captura viva. */
  readonly photo = this.slot.asReadonly();

  /** La barra usa esta señal para habilitar `Captura`. */
  readonly hasPhoto = computed(() => this.slot() !== null);

  /** Deposita la foto tomada fuera del panel, o la que reemplaza al retomar. */
  stage(file: File): void {
    this.slot.set(file);
  }

  /** Devuelve la foto vigente **sin consumirla**: volver al panel la reutiliza. */
  peek(): File | null {
    return this.slot();
  }

  /** Termina la sesión: guardar, publicar o cerrar sesión. */
  clear(): void {
    this.slot.set(null);
  }
}
