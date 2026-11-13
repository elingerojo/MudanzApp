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
 *
 * Desde 3f la tubería también compone el camino de **una** foto (`attachPhoto`) y la máquina de
 * estados que la tira usa para decir en qué está cada una. La máquina es pura y vive aquí, al lado de
 * la costura que la ejercita, para que el panel no tenga que fiarse de sí mismo.
 */

/** La foto que viaja a un `slot` del artículo: el ticket puede venir ya pedido o pedirse aquí. */
export interface PendingPhotoUpload {
  readonly optimized: readonly OptimizedPhoto[];
  /** La `position` que el servidor usará; el cliente la asigna y el `upsert` la respeta. */
  readonly slot: number;
  /** Ticket vivo (la captura lo pide al optimizar); `null` lo pide esta tubería. */
  readonly ticket: CaptureTicket | null;
}

/**
 * El estado de una foto en la tira del panel de captura (`plan-ciclo-3f` §5).
 *
 * Vive en el componente y muere con la pestaña: no es un hecho del producto, no se persiste y no
 * toca el contrato. `local` es la foto que ya está optimizada en el teléfono pero todavía no viajó.
 */
export type PhotoUploadState = 'optimizing' | 'local' | 'uploading' | 'uploaded' | 'failed';

/** El hecho que mueve una foto; el nombre es el hecho, no el estado al que lleva. */
export type PhotoUploadEvent = 'optimized' | 'start' | 'done' | 'fail';

/** Transición que la máquina no admite: es un defecto del cliente, no del borde. */
export class PhotoStateError extends Error {
  constructor(
    readonly from: PhotoUploadState,
    readonly event: PhotoUploadEvent,
  ) {
    super(`photo-state-invalid:${from}:${event}`);
    this.name = 'PhotoStateError';
  }
}

/**
 * La tabla de transiciones, y con ella las dos invariantes que la tira declara:
 *
 * - `uploaded` solo se alcanza desde `uploading`: una foto no está subida porque alguien lo diga,
 *   sino porque la adjunción la confirmó;
 * - una foto no puede empezar dos subidas a la vez, porque `start` desde `uploading` no existe.
 */
const PHOTO_TRANSITIONS: Record<
  PhotoUploadState,
  Partial<Record<PhotoUploadEvent, PhotoUploadState>>
> = {
  optimizing: { optimized: 'local' },
  local: { start: 'uploading' },
  uploading: { done: 'uploaded', fail: 'failed' },
  uploaded: {},
  failed: { start: 'uploading' },
};

/** El siguiente estado, o un error si el paso no existe en la máquina. */
export function advancePhotoState(
  from: PhotoUploadState,
  event: PhotoUploadEvent,
): PhotoUploadState {
  const next = PHOTO_TRANSITIONS[from][event];
  if (next === undefined) {
    throw new PhotoStateError(from, event);
  }

  return next;
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
   *
   * Es el camino de la **edición**, que añade un lote y no necesita estado por foto. El panel de
   * captura usa [`attachPhoto`](#attachPhoto), que adjunta de a una (`plan-ciclo-3f` §4).
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

  /**
   * Sube las tres variantes de **una** foto y la adjunta al artículo en su `slot`.
   *
   * Es la adjunción de a una del corte 3f: el estado es por foto, así que el fallo de una no puede
   * arrastrar a las demás ni obligar a reenviar los bytes de las que ya están en el artículo. El
   * progreso que reporta es el de esa foto —ponderado por bytes entre sus tres variantes—; el
   * agregado de la tanda lo compone quien llama, porque solo él sabe cuántas faltan.
   */
  async attachPhoto(input: {
    readonly eventId: string;
    readonly itemId: string;
    readonly photo: PendingPhotoUpload;
    readonly onProgress?: (percent: number) => void;
  }): Promise<readonly ItemPhoto[]> {
    const ticket = await this.ensureTicket(input.eventId, input.photo);

    const tasks: UploadTask[] = input.photo.optimized.map((entry) => ({
      variant: entry.variant,
      blob: entry.blob,
      widthPx: entry.widthPx,
      heightPx: entry.heightPx,
      url: this.uploadUrl(ticket.uploads[entry.variant].url),
    }));

    await this.sendPhoto(tasks, ticket.contentType, (percent) => {
      input.onProgress?.(percent);
    });

    const payload = await firstValueFrom(
      this.http.post<AttachedPhotos>(
        `${this.apiBaseUrl}/events/${input.eventId}/items/${input.itemId}/photos`,
        {
          captures: [
            {
              captureId: ticket.captureId,
              slot: input.photo.slot,
              variants: input.photo.optimized.map((entry) => ({
                variant: entry.variant,
                widthPx: entry.widthPx,
                heightPx: entry.heightPx,
              })),
            },
          ],
        },
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
