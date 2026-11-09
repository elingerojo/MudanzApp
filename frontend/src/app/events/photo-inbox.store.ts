import { Injectable, signal } from '@angular/core';

/**
 * Buzón de una sola foto entre la barra inferior y el panel de captura (corte D12).
 *
 * La shell tiene el input de cámara —así el botón `Foto` vive en una sola pantalla— y el panel de
 * captura sigue siendo el dueño de la optimización, el ticket y los mensajes. Este store es la
 * costura entre los dos: la shell **deposita** el archivo y el formulario lo **consume** una sola vez.
 *
 * Reglas:
 *
 * - Una sola ranura: la foto más reciente reemplaza a la anterior.
 * - Vive en memoria y muere con la pestaña. No se serializa ni se escribe en disco (X8).
 * - No valida tipo ni tamaño: esa regla vive en el formulario y dos validaciones divergen.
 */
@Injectable({ providedIn: 'root' })
export class PhotoInboxStore {
  private readonly slot = signal<File | null>(null);

  /** Deposita la foto tomada desde la barra. */
  stage(file: File): void {
    this.slot.set(file);
  }

  /** Entrega la foto pendiente y vacía la ranura: nadie la recibe dos veces. */
  take(): File | null {
    const file = this.slot();
    if (file !== null) {
      this.slot.set(null);
    }

    return file;
  }

  /** Vacía la ranura sin entregarla; la shell lo hace al cerrar la sesión. */
  clear(): void {
    this.slot.set(null);
  }
}
