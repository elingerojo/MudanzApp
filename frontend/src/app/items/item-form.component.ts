import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import {
  ITEM_LIMITS,
  ITEM_PHOTO_CONTENT_TYPES,
  ITEM_PHOTO_ENCODING,
  ITEM_PHOTO_VARIANTS,
  ITEM_PHOTO_VARIANT_CONTENT_TYPES,
  type AiDraftResult,
  type AttachedPhotos,
  type CaptureTicket,
  type CreateItemRequest,
  type CreatedItem,
  type ItemPhotoVariant,
  type ItemPhotoVariantContentType,
  type PublishedListing,
} from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import { PhotoInboxStore } from '../events/photo-inbox.store';
import {
  AI_NOT_CONFIGURED,
  AI_OUTPUT_INVALID,
  AI_UNAVAILABLE,
  PHOTO_INVALID,
  apiErrorCode,
} from '../session/api-error';
import { uiButtonClasses } from '../ui/ui-button/ui-button';
import {
  PROGRESS_DONE_FLASH_MS,
  UiProgressButtonComponent,
  type UiProgressState,
} from '../ui/ui-progress-button/ui-progress-button';
import { sizeLabel } from './photo-encoding';
import type { OptimizedPhoto } from './photo-optimizer';
import { PHOTO_OPTIMIZER } from './photo-optimizer.token';
import type { UploadTask } from './photo-upload';
import { PHOTO_UPLOADER } from './photo-upload.token';

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

/** Fallo al pedir el borrador, ramificado por `code` y nunca por el mensaje del borde. */
function draftMessage(code: string | null): string {
  switch (code) {
    case AI_NOT_CONFIGURED:
      return 'La IA no está configurada en este entorno. Escribe la ficha a mano.';
    case AI_OUTPUT_INVALID:
      return 'La IA devolvió una ficha que no se puede usar. Revísala y escríbela a mano.';
    case PHOTO_INVALID:
      return 'La foto no se pudo enviar. Repítela.';
    case AI_UNAVAILABLE:
    default:
      return 'La IA no respondió. Escribe la ficha a mano y publícala igual.';
  }
}

/** Tipos admitidos para el `accept` del input; la lista vive en el contrato compartido. */
const ACCEPT_ATTRIBUTE = ITEM_PHOTO_CONTENT_TYPES.join(',');

/** Un ticket sirve hasta un minuto antes de caducar; pasado eso se pide otro. */
const TICKET_MARGIN_MS = 60_000;

/** Espera del destello de cierre antes de limpiar la ficha. */
function flashDelay(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, PROGRESS_DONE_FLASH_MS);
  });
}

/**
 * Captura de un artículo con borrador de la IA y publicación en la misma pantalla (`ai-draft`, 3d;
 * subida directa al almacén desde 4g).
 *
 * El recorrido sigue siendo el del plan §6: la persona toma la foto, **pide** el borrador con un
 * toque, edita sin prisa y decide entre **Publicar** y **Solo guardar**. Dos reglas ordenan el
 * componente:
 *
 * 1. El borrador nunca arranca solo: sin toque no hay llamada.
 * 2. Nada de lo que hace el humano espera a la IA: `Publicar` y `Solo guardar` dependen de la foto y
 *    del título, no de que el borrador haya vuelto.
 *
 * Desde 4g el cuerpo de la foto **no cruza el backend**: al optimizar se pide un ticket con las tres
 * URL prefirmadas y, al pulsar, las tres variantes suben en paralelo al almacén con su progreso
 * ponderado; el API sólo recibe la adjunción (`plan-ciclo-4g-direct-upload` §3 y §5). La mediana del
 * borrador sigue yendo a Railway, que la convierte a base64 y no la guarda.
 */
@Component({
  selector: 'app-item-form',
  imports: [UiProgressButtonComponent],
  templateUrl: './item-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemFormComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly optimize = inject(PHOTO_OPTIMIZER);
  private readonly sendPhoto = inject(PHOTO_UPLOADER);
  private readonly inbox = inject(PhotoInboxStore);

  readonly eventId = input.required<string>();

  /** `null` cuando solo se guardó; el `slug` cuando se publicó. */
  readonly saved = output<string | null>();

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
  protected readonly drafting = signal(false);
  protected readonly publishing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** Progreso de la tanda de subidas, de 0 a 99; `null` mientras no hay tanda. */
  protected readonly progress = signal<number | null>(null);

  /** Qué acción se pulsó, para que sólo su botón muestre progreso. */
  private readonly activeAction = signal<'publish' | 'save' | null>(null);

  /** El trabajo terminó y el botón está en su destello de cierre. */
  private readonly flashing = signal(false);

  /** La última subida falló: el artículo existe y la foto se puede reintentar sin reescribir nada. */
  protected readonly photoFailed = signal(false);

  protected readonly busy = computed(() => this.optimizing() || this.publishing());

  /** Sin foto optimizada no hay borrador ni hay artículo: es la compuerta de las tres acciones. */
  protected readonly ready = computed(
    () => this.photo() !== null && this.optimized().length > 0 && !this.optimizing(),
  );

  /** `Publicar` y `Solo guardar` no miran `drafting()`: la IA nunca bloquea al humano. */
  protected readonly canSubmit = computed(
    () => this.ready() && this.title().trim().length > 0 && !this.publishing(),
  );

  protected readonly canDraft = computed(
    () => this.medium() !== null && !this.drafting() && !this.publishing(),
  );

  protected readonly primaryClasses = uiButtonClasses('primary');
  protected readonly secondaryClasses = uiButtonClasses('secondary');

  /** Los tres blobs ya optimizados en el dispositivo; el peso no se envía como dato. */
  private readonly optimized = signal<readonly OptimizedPhoto[]>([]);

  /** La variante que viaja al borrador: la misma que después se sube a R2, sin recodificar. */
  protected readonly medium = computed(
    () => this.optimized().find((entry) => entry.variant === 'medium')?.blob ?? null,
  );

  /** Artículo ya creado en este formulario: evita un alta doble al reintentar. */
  private readonly createdItemId = signal<string | null>(null);

  /** Si el intento en curso pedía publicar, el reintento de la foto también publica. */
  private readonly pendingPublish = signal(false);

  /** Ticket vivo: sus tres URL y el `captureId` con el que se adjunta. */
  private readonly capture = signal<CaptureTicket | null>(null);

  private objectUrl: string | null = null;

  /** La última foto procesada por esta instancia: el efecto no repite el trabajo. */
  private lastAccepted: File | null = null;

  constructor() {
    // La foto vive en la sesión de captura (cortes D12 y D13), no en el formulario: al montarse se
    // procesa la vigente —aunque ya se hubiera procesado en una visita anterior—, y si vuelve a
    // cambiar la referencia la procesa de nuevo.
    effect(() => {
      const pending = this.inbox.photo();
      if (pending !== null && pending !== this.lastAccepted) {
        void this.acceptPhoto(pending);
      }
    });
  }

  protected onInput(target: 'title' | 'note' | 'widthCm' | 'heightCm' | 'depthCm' | 'weightKg') {
    return (event: Event): void => {
      const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
      this[target].set(value);
    };
  }

  /** Estado que se le pasa a cada botón: sólo la acción pulsada sale de `idle`. */
  protected stateFor(action: 'publish' | 'save'): UiProgressState {
    if (this.activeAction() !== action) {
      return 'idle';
    }

    return this.flashing() ? 'done' : 'working';
  }

  /**
   * Acepta la foto elegida en el panel. El input se vacía siempre para que la misma foto pueda
   * elegirse dos veces seguidas; el procesamiento es el único de `acceptPhoto`.
   */
  protected async onPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const [file] = Array.from(input.files ?? []);
    input.value = '';
    if (file === undefined) {
      return;
    }

    // Retomar reemplaza la foto de la sesión (corte D13): volver al panel usa la misma.
    this.inbox.stage(file);
    await this.acceptPhoto(file);
  }

  /**
   * Acepta la foto, la optimiza en el dispositivo, la previsualiza y pide el ticket.
   *
   * Es el camino **único** de una foto: la elegida en el panel y la tomada con el botón `Foto` de la
   * barra (corte D12) pasan por aquí, así que las dos tienen los mismos mensajes, el mismo orden y el
   * mismo ticket. Además, la foto del buzón reemplaza solo la foto: no borra lo que ya está escrito.
   *
   * Un archivo rechazado no reemplaza al que ya estaba: el mensaje explica el motivo y la captura
   * sigue siendo válida. El ticket se pide **aquí** y no al pulsar, para que el tap no pague un viaje
   * de ida y vuelta; no escribe nada en el almacén.
   */
  private async acceptPhoto(file: File): Promise<void> {
    this.lastAccepted = file;

    const typeAccepted = (ITEM_PHOTO_CONTENT_TYPES as readonly string[]).includes(file.type);
    if (!typeAccepted) {
      this.error.set('La foto debe ser JPEG, PNG o WebP.');
      this.endEmptySession(file);
      return;
    }

    // El tope es del **archivo de la cámara**, no de lo que viaja: la original nunca sale del
    // dispositivo. Un archivo mayor se rechaza aquí, sin tocar la red.
    if (file.size > ITEM_LIMITS.photoBytes) {
      this.error.set(`La foto supera el límite de ${String(this.maxPhotoMiB)} MB.`);
      this.endEmptySession(file);
      return;
    }

    this.error.set(null);
    this.notice.set(null);
    this.optimizing.set(true);

    // La foto anterior y su staging dejan de servir en cuanto llega la nueva.
    this.discardCapture();

    try {
      const optimized = await this.optimize(file);

      this.optimized.set(optimized);
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

      // Una foto nueva invalida el borrador anterior: el texto que ya hay se queda, pero el aviso
      // deja de prometer que describe esta foto.
      if (this.notice() !== null) {
        this.notice.set('El borrador era de la foto anterior. Revísalo antes de publicar.');
      }

      await this.ensureTicket();
    } catch {
      this.clearPhoto();
      this.endEmptySession(file);
      this.error.set('No se pudo procesar esta foto. Elige otra o toma una nueva.');
    } finally {
      this.optimizing.set(false);
    }
  }

  /** Una foto rechazada sin foto anterior deja la sesión sin nada que capturar: se cierra. */
  private endEmptySession(file: File): void {
    if (this.photo() === null && this.inbox.photo() === file) {
      this.inbox.clear();
    }
  }

  /**
   * Pide el borrador con la variante `medium` ya codificada y rellena **solo los campos vacíos**: si
   * la persona ya escribió, no se sobrescribe y el aviso lo dice.
   */
  protected async draft(): Promise<void> {
    const blob = this.medium();
    if (blob === null || !this.canDraft()) {
      return;
    }

    this.drafting.set(true);
    this.error.set(null);
    this.notice.set(null);

    try {
      const result = await firstValueFrom(
        this.http.post<AiDraftResult>(
          `${this.apiBaseUrl}/events/${this.eventId()}/ai/drafts`,
          blob,
          { headers: { 'Content-Type': blob.type } },
        ),
      );

      const wroteTitle = this.title().trim().length > 0;
      const wroteNote = this.note().trim().length > 0;
      if (!wroteTitle) {
        this.title.set(result.draft.title);
      }
      if (!wroteNote) {
        this.note.set(result.draft.note);
      }

      this.notice.set(
        wroteTitle || wroteNote
          ? 'Borrador de la IA: se respetó lo que ya habías escrito. Revísalo antes de publicar.'
          : 'Borrador de la IA: revísalo antes de publicar.',
      );
    } catch (error: unknown) {
      this.error.set(draftMessage(apiErrorCode(error)));
    } finally {
      this.drafting.set(false);
    }
  }

  /** El tap primario: crea el artículo, sube las tres variantes, las adjunta y publica. */
  protected publish(event: Event): void {
    event.preventDefault();
    void this.send('publish');
  }

  /** La ficha queda privada en el evento y se publica después desde `Capturados`. */
  protected saveOnly(): void {
    void this.send('save');
  }

  /**
   * Reintenta la foto de un artículo que ya se creó. La ficha no se pierde y, si el intento pedía
   * publicar, se publica al terminar.
   */
  protected async retryPhoto(): Promise<void> {
    const itemId = this.createdItemId();
    if (itemId === null || this.publishing()) {
      return;
    }

    this.publishing.set(true);
    this.error.set(null);
    this.activeAction.set(this.pendingPublish() ? 'publish' : 'save');
    this.progress.set(0);

    try {
      await this.upload(itemId);
      this.photoFailed.set(false);
      const slug = this.pendingPublish() ? await this.publishItem(itemId) : null;
      await this.finish(slug);
    } catch (error: unknown) {
      this.error.set(
        apiErrorCode(error) === PHOTO_INVALID
          ? 'El servidor rechazó la foto. Vuelve a elegirla e inténtalo de nuevo.'
          : 'No se pudo subir la foto. Inténtalo de nuevo.',
      );
    } finally {
      this.publishing.set(false);
      this.progress.set(null);
      this.activeAction.set(null);
      this.flashing.set(false);
    }
  }

  private async send(mode: 'publish' | 'save'): Promise<void> {
    if (this.publishing() || this.optimizing()) {
      return;
    }

    const body = this.buildBody();
    if (body === null) {
      return;
    }

    this.publishing.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.activeAction.set(mode);
    this.progress.set(0);
    this.pendingPublish.set(mode === 'publish');

    let step: 'create' | 'photo' | 'publish' = 'create';

    try {
      const itemId = this.createdItemId() ?? (await this.create(body));

      step = 'photo';
      await this.upload(itemId);

      step = 'publish';
      const slug = this.pendingPublish() ? await this.publishItem(itemId) : null;

      await this.finish(slug);
    } catch (error: unknown) {
      const code = apiErrorCode(error);

      if (step === 'photo') {
        // La quinta petición no se intenta: sin foto no hay publicación posible.
        this.photoFailed.set(true);
        this.error.set('El artículo se guardó, pero la foto no. Reinténtala.');
      } else if (step === 'publish') {
        this.error.set(
          'El artículo se guardó, pero no se pudo publicar. Inténtalo desde «Capturados».',
        );
      } else {
        this.error.set(
          code === PHOTO_INVALID
            ? 'El servidor rechazó la foto. Vuelve a elegirla e inténtalo de nuevo.'
            : 'No se pudo guardar el artículo. Inténtalo de nuevo.',
        );
      }
    } finally {
      this.publishing.set(false);
      this.progress.set(null);
      this.activeAction.set(null);
      this.flashing.set(false);
    }
  }

  /** Destello, aviso y limpieza: el botón termina antes de que la ficha se vacíe. */
  private async finish(slug: string | null): Promise<void> {
    this.flashing.set(true);
    await flashDelay();
    this.saved.emit(slug);
    this.reset();

    // Guardar o publicar termina la captura (corte D13): la barra deshabilita `Captura` y volver
    // exige una foto nueva.
    this.inbox.clear();
    this.lastAccepted = null;
  }

  /** Crea el artículo una sola vez por formulario y recuerda su identificador. */
  private async create(body: CreateItemRequest): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<CreatedItem>(`${this.apiBaseUrl}/events/${this.eventId()}/items`, body),
    );

    this.createdItemId.set(created.item.id);
    return created.item.id;
  }

  private async publishItem(itemId: string): Promise<string> {
    const listing = await firstValueFrom(
      this.http.post<PublishedListing>(
        `${this.apiBaseUrl}/events/${this.eventId()}/items/${itemId}/listing`,
        {},
      ),
    );

    return listing.slug;
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

  /**
   * Sube las tres variantes **en paralelo** al almacén y adjunta la captura al artículo.
   *
   * El progreso es ponderado por bytes: la `large` manda y el porcentaje lo dice. La adjunción va
   * después de que las tres existan, porque el borde las verifica con `HEAD`.
   */
  private async upload(itemId: string): Promise<void> {
    const ticket = await this.ensureTicket();
    const optimized = this.optimized();

    const tasks: UploadTask[] = optimized.map((entry) => ({
      variant: entry.variant,
      blob: entry.blob,
      widthPx: entry.widthPx,
      heightPx: entry.heightPx,
      url: this.uploadUrl(ticket.uploads[entry.variant].url),
    }));

    await this.sendPhoto(tasks, ticket.contentType, (percent) => {
      this.progress.set(percent);
    });

    const body = {
      captures: [
        {
          captureId: ticket.captureId,
          slot: 0,
          variants: optimized.map((entry) => ({
            variant: entry.variant,
            widthPx: entry.widthPx,
            heightPx: entry.heightPx,
          })),
        },
      ],
    };

    await firstValueFrom(
      this.http.post<AttachedPhotos>(
        `${this.apiBaseUrl}/events/${this.eventId()}/items/${itemId}/photos`,
        body,
      ),
    );

    // Ya está adjunta: el staging lo borró el borde y no hay nada que descartar.
    this.capture.set(null);
  }

  /** El ticket vivo si aún sirve; si no, uno nuevo. */
  private async ensureTicket(): Promise<CaptureTicket> {
    const current = this.capture();
    if (current !== null && Date.parse(current.expiresAt) - Date.now() > TICKET_MARGIN_MS) {
      return current;
    }

    const contentType = this.uploadContentType();
    const ticket = await firstValueFrom(
      this.http.post<CaptureTicket>(`${this.apiBaseUrl}/events/${this.eventId()}/captures`, {
        contentType,
      }),
    );

    this.capture.set(ticket);
    return ticket;
  }

  /** El tipo que el codificador produjo, o su tipo por defecto si el navegador no lo declara. */
  private uploadContentType(): ItemPhotoVariantContentType {
    const type = this.optimized()[0]?.blob.type ?? '';
    const accepted = (ITEM_PHOTO_VARIANT_CONTENT_TYPES as readonly string[]).includes(type);

    return accepted ? (type as ItemPhotoVariantContentType) : ITEM_PHOTO_ENCODING.type;
  }

  /** Descarta el staging de una captura que no se va a adjuntar. Mejor esfuerzo y sin ruido. */
  private discardCapture(): void {
    const ticket = this.capture();
    if (ticket === null) {
      return;
    }

    this.capture.set(null);
    this.http
      .delete(`${this.apiBaseUrl}/events/${this.eventId()}/captures/${ticket.captureId}`)
      .subscribe({ error: () => undefined });
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
    this.discardCapture();
    this.optimized.set([]);
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
    this.createdItemId.set(null);
    this.pendingPublish.set(false);
    this.photoFailed.set(false);
    this.error.set(null);
    this.notice.set(null);
    this.progress.set(null);
    this.flashing.set(false);
  }

  /**
   * Salir del formulario no termina la captura (corte D13): la foto sigue en la sesión y volver al
   * panel la reutiliza. Solo se descartan el staging y la vista previa, que son de esta instancia.
   */
  ngOnDestroy(): void {
    this.discardCapture();
    this.releasePreview();
  }
}

/** Fila de la tarjeta de pesos: dimensiones y peso reales de la variante que el dispositivo produjo. */
interface SizeEntry {
  readonly variant: ItemPhotoVariant;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly byteSize: number;
  readonly label: string;
}
