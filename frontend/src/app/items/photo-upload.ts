import type { ItemPhotoVariant } from '@mudanzapp/shared';

/**
 * Transporte de las variantes al almacén (ciclo 4g, `direct-upload`).
 *
 * El navegador escribe los bytes **directo** en el almacén con la URL prefirmada del ticket; el API
 * sólo recibe el JSON de la adjunción. Por eso aquí no hay `HttpClient`: no hay interceptor que
 * añada credenciales porque la URL ya está firmada, y `fetch` no expone el avance de subida.
 *
 * El progreso se pondera **por bytes**, no por número de peticiones: la `large` tarda varias veces
 * más que el `thumb` y contarla igual que las demás haría que el porcentaje mintiera.
 */

/** Una variante lista para viajar: el `Blob` que el optimizador ya codificó en el dispositivo. */
export interface UploadTask {
  readonly variant: ItemPhotoVariant;
  readonly blob: Blob;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly url: string;
}

/** Lo que el formulario necesita de cada variante cuando termina. */
export interface UploadedVariant {
  readonly variant: ItemPhotoVariant;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Error del transporte: el código no es del borde, así que se explica con su estado HTTP. */
export class PhotoUploadError extends Error {
  constructor(readonly status: number) {
    super(`photo-upload-failed:${String(status)}`);
    this.name = 'PhotoUploadError';
  }
}

/**
 * Porcentaje agregado de una tanda de subidas, ponderado por bytes.
 *
 * `0` cuando no hay nada que subir o los tamaños aún no se conocen; el componente decide el tope
 * del 99 % y cuándo poner el 100, porque eso depende de que el servidor confirme la adjunción.
 */
export function weightedProgress(
  entries: readonly { readonly loaded: number; readonly total: number }[],
): number {
  let loaded = 0;
  let total = 0;

  for (const entry of entries) {
    loaded += entry.loaded;
    total += entry.total;
  }

  if (total <= 0) {
    return 0;
  }

  return Math.min(99, Math.round((loaded / total) * 100));
}

/** Sube una variante y avisa del avance de **su** cuerpo, para poder ponderarlo. */
function putVariant(
  task: UploadTask,
  contentType: string,
  onProgress: (loaded: number) => void,
): Promise<UploadedVariant> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', task.url);
    // La firma incluye el tipo: mandar otro distinto provoca el `403` del almacén.
    request.setRequestHeader('Content-Type', contentType);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded);
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve({ variant: task.variant, widthPx: task.widthPx, heightPx: task.heightPx });
        return;
      }

      reject(new PhotoUploadError(request.status));
    };

    request.onerror = () => {
      reject(new PhotoUploadError(0));
    };

    request.onabort = () => {
      reject(new PhotoUploadError(0));
    };

    request.send(task.blob);
  });
}

/**
 * Sube las tres variantes **en paralelo** y reporta el porcentaje ponderado por bytes.
 *
 * En paralelo y no en serie porque el reloj lo fija la `large`: encadenarlas sumaría las tres
 * esperas. Cualquier fallo rechaza la tanda; las que ya viajaron no se cancelan y el cliente las
 * descarta con el `DELETE` del ticket.
 */
export async function uploadVariants(
  tasks: readonly UploadTask[],
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<readonly UploadedVariant[]> {
  const loaded = new Map<ItemPhotoVariant, number>();
  const total = tasks.reduce((sum, task) => sum + task.blob.size, 0);

  for (const task of tasks) {
    loaded.set(task.variant, 0);
  }

  const snapshot = (): { loaded: number; total: number }[] =>
    tasks.map((task) => ({ loaded: loaded.get(task.variant) ?? 0, total: total }));

  const uploads = tasks.map((task) =>
    putVariant(task, contentType, (bytes) => {
      loaded.set(task.variant, bytes);
      onProgress(weightedProgress(snapshot()));
    }),
  );

  const results = await Promise.all(uploads);
  onProgress(99);

  return results;
}
