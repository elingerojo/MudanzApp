import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ITEM_PHOTO_ENCODING,
  ITEM_PHOTO_VARIANT_CONTENT_TYPES,
  type AttachedPhotos,
  type CaptureTicket,
  type ItemPhoto,
  type ItemPhotoVariant,
  type ItemPhotoVariantContentType,
} from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import type { OptimizedPhoto } from './photo-optimizer';
import { PHOTO_OPTIMIZER } from './photo-optimizer.token';
import type { UploadTask } from './photo-upload';
import { PHOTO_UPLOADER } from './photo-upload.token';

/**
 * Tubería de una foto (`plan-ciclo-3e` §6): optimizar en el dispositivo, pedir el ticket, subir las
 * tres variantes al almacén y adjuntar la captura al artículo.
 *
 * Nace de extraer el camino que 4g dejó dentro del formulario de captura: la **misma** tubería sirve
 * a la captura y a la edición, así que una foto no puede subirse de dos maneras distintas según la
 * pantalla. El cuerpo de la foto sigue sin cruzar el API.
 */

/** La foto que viaja a un `slot` del artículo: el ticket puede venir ya pedido o pedirse aquí. */
export interface PendingPhotoUpload {
  readonly optimized: readonly OptimizedPhoto[];
  /** La `position` que el servidor usará; el cliente la asigna y el `upsert` la respeta. */
  readonly slot: number;
  /** Ticket vivo (la captura lo pide al optimizar); `null` lo pide esta tubería. */
  readonly ticket: CaptureTicket | null;
}

/** Un ticket sirve hasta un minuto antes de caducar; pasado eso se pide otro. */
const TICKET_MARGIN_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class PhotoPipeline {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly optimizePhoto = inject(PHOTO_OPTIMIZER);
  private readonly sendPhoto = inject(PHOTO_UPLOADER);

  /** Optimiza la foto elegida en las tres variantes que viajan. */
  optimize(file: File): Promise<readonly OptimizedPhoto[]> {
    return this.optimizePhoto(file);
  }

  /** Pide un ticket para una captura ya optimizada. No escribe nada en el almacén. */
  async openTicket(eventId: string, optimized: readonly OptimizedPhoto[]): Promise<CaptureTicket> {
    return firstValueFrom(
      this.http.post<CaptureTicket>(`${this.apiBaseUrl}/events/${eventId}/captures`, {
        contentType: this.uploadContentType(optimized),
      }),
    );
  }

  /** Descarta el staging de una captura que no se va a adjuntar. Mejor esfuerzo y sin ruido. */
  discardTicket(eventId: string, captureId: string): void {
    this.http
      .delete(`${this.apiBaseUrl}/events/${eventId}/captures/${captureId}`)
      .subscribe({ error: () => undefined });
  }

  /**
   * Sube las tres variantes de cada foto y las adjunta al artículo en **una sola** petición.
   *
   * Se sube foto por foto y el progreso se pondera por foto y por bytes: una tanda de seis no puede
   * mentir con el porcentaje. La adjunción va después de que todas existan, porque el borde verifica
   * cada objeto con `HEAD`.
   */
  async attach(input: {
    readonly eventId: string;
    readonly itemId: string;
    readonly photos: readonly PendingPhotoUpload[];
    readonly onProgress?: (percent: number) => void;
  }): Promise<readonly ItemPhoto[]> {
    const captures: {
      readonly captureId: string;
      readonly slot: number;
      readonly variants: readonly {
        readonly variant: ItemPhotoVariant;
        readonly widthPx: number;
        readonly heightPx: number;
      }[];
    }[] = [];

    const total = input.photos.length;

    for (const [index, photo] of input.photos.entries()) {
      const ticket = await this.ensureTicket(input.eventId, photo);
      const tasks: UploadTask[] = photo.optimized.map((entry) => ({
        variant: entry.variant,
        blob: entry.blob,
        widthPx: entry.widthPx,
        heightPx: entry.heightPx,
        url: this.uploadUrl(ticket.uploads[entry.variant].url),
      }));

      await this.sendPhoto(tasks, ticket.contentType, (percent) => {
        // El tope es 99: el 100 lo pone la confirmación de la adjunción, no el transporte.
        input.onProgress?.(Math.min(99, Math.round(((index + percent / 100) / total) * 100)));
      });

      captures.push({
        captureId: ticket.captureId,
        slot: photo.slot,
        variants: photo.optimized.map((entry) => ({
          variant: entry.variant,
          widthPx: entry.widthPx,
          heightPx: entry.heightPx,
        })),
      });
    }

    const payload = await firstValueFrom(
      this.http.post<AttachedPhotos>(
        `${this.apiBaseUrl}/events/${input.eventId}/items/${input.itemId}/photos`,
        { captures },
      ),
    );

    return payload.photos;
  }

  /** El ticket vivo si aún sirve; si no, uno nuevo. */
  private async ensureTicket(eventId: string, photo: PendingPhotoUpload): Promise<CaptureTicket> {
    const current = photo.ticket;
    if (current !== null && Date.parse(current.expiresAt) - Date.now() > TICKET_MARGIN_MS) {
      return current;
    }

    return this.openTicket(eventId, photo.optimized);
  }

  /**
   * Resuelve la URL de subida.
   *
   * En `live` el ticket trae una URL absoluta al almacén y se usa tal cual. En `fake` trae una ruta
   * relativa al API, y el prefijo lo pone el cliente: así el doble se sirve por el mismo proxy que el
   * resto del contrato y ninguna prueba depende de un host.
   */
  private uploadUrl(raw: string): string {
    return raw.startsWith('http') ? raw : `${this.apiBaseUrl}${raw}`;
  }

  /** El tipo que el codificador produjo, o su tipo por defecto si el navegador no lo declara. */
  private uploadContentType(optimized: readonly OptimizedPhoto[]): ItemPhotoVariantContentType {
    const type = optimized[0]?.blob.type ?? '';
    const accepted = (ITEM_PHOTO_VARIANT_CONTENT_TYPES as readonly string[]).includes(type);

    return accepted ? (type as ItemPhotoVariantContentType) : ITEM_PHOTO_ENCODING.type;
  }
}
