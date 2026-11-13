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
  untracked,
} from '@angular/core';
import {
  CAPTURE_LIMITS,
  ITEM_LIMITS,
  ITEM_PHOTO_CONTENT_TYPES,
  onboardingLevelCopy,
  promotionFor,
  type AiDraftResult,
  type CaptureTicket,
  type CreateItemRequest,
  type CreatedItem,
  type ItemPhotoVariant,
  type OnboardingLevel,
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
import { SessionStore } from '../session/session.store';
import { uiButtonClasses } from '../ui/ui-button/ui-button';
import {
  PROGRESS_DONE_FLASH_MS,
  UiProgressButtonComponent,
  type UiProgressState,
} from '../ui/ui-progress-button/ui-progress-button';
import { sizeLabel } from './photo-encoding';
import { PhotoGalleryComponent, type GalleryPhoto } from './photo-gallery.component';
import { PhotoPipeline, type PendingPhotoUpload } from './photo-pipeline';
import type { OptimizedPhoto } from './photo-optimizer';

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

/** Espera del destello de cierre antes de limpiar la ficha. */
function flashDelay(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, PROGRESS_DONE_FLASH_MS);
  });
}

/** Una foto ya preparada en el dispositivo: sus tres variantes, su ticket y su vista previa. */
interface PreparedPhoto {
  readonly optimized: readonly OptimizedPhoto[];
  readonly ticket: CaptureTicket;
  readonly previewUrl: string | null;
  /** Ya se escribió en el artículo: un reintento de publicación no la vuelve a subir. */
  readonly attached: boolean;
}

/** Una foto de la sesión de captura, con su preparación si ya terminó. */
interface FormPhoto {
  readonly file: File;
  readonly prepared: PreparedPhoto | null;
}

/**
 * Captura de un artículo con borrador de la IA y publicación en la misma pantalla (`ai-draft`, 3d;
 * subida directa al almacén desde 4g; galería privada desde 3e).
 *
 * El recorrido sigue siendo el del plan §6: la persona toma una o varias fotos, **pide** el borrador
 * con un toque, edita sin prisa y decide entre **Publicar** y **Solo guardar**. Tres reglas ordenan
 * el componente:
 *
 * 1. El borrador nunca arranca solo: sin toque no hay llamada.
 * 2. Nada de lo que hace el humano espera a la IA: `Publicar` y `Solo guardar` dependen de las fotos y
 *    del título, no de que el borrador haya vuelto.
 * 3. El orden lo decide la persona **durante la captura**: la primera foto es la portada, abre la
 *    ficha y alimenta el borrador, y el orden en que se adjuntan es el de la tira.
 *
 * El cuerpo de la foto **no cruza el backend**: la tubería de [`photo-pipeline`](./photo-pipeline.ts)
 * pide el ticket, sube las tres variantes por sus URL prefirmadas y adjunta las capturas al artículo.
 */
@Component({
  selector: 'app-item-form',
  imports: [PhotoGalleryComponent, UiProgressButtonComponent],
  templateUrl: './item-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemFormComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly pipeline = inject(PhotoPipeline);
  private readonly inbox = inject(PhotoInboxStore);
  private readonly session = inject(SessionStore);

  readonly eventId = input.required<string>();

  /** `null` cuando solo se guardó; el `slug` cuando se publicó. */
  readonly saved = output<string | null>();

  protected readonly maxPhotos = CAPTURE_LIMITS.photos;
  protected readonly maxPhotoMiB = ITEM_LIMITS.photoBytes / (1024 * 1024);

  protected readonly title = signal('');
  protected readonly note = signal('');
  protected readonly widthCm = signal('');
  protected readonly heightCm = signal('');
  protected readonly depthCm = signal('');
  protected readonly weightKg = signal('');

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

  /** La última subida falló: el artículo existe y las fotos se pueden reintentar. */
  protected readonly photoFailed = signal(false);

  /** Cada foto ya preparada, por archivo; el efecto no repite el trabajo de la misma foto. */
  private readonly prepared = signal<ReadonlyMap<File, PreparedPhoto>>(new Map());

  /** Fotografías que están siendo optimizadas ahora mismo. */
  private readonly preparing = new Set<File>();

  /** Vistas previas vivas, para revocarlas al salir o al descartar la foto. */
  private readonly previews = new Map<File, string>();

  /** Llave estable por archivo: el orden de la tira cambia y el `track` no debe perderse. */
  private readonly keys = new WeakMap<File, string>();
  private nextKey = 0;

  /** Artículo ya creado en este formulario: evita un alta doble al reintentar. */
  private readonly createdItemId = signal<string | null>(null);

  /** Si el intento en curso pedía publicar, el reintento de la foto también publica. */
  private readonly pendingPublish = signal(false);

  /** La tira completa, en el orden de la sesión de captura. */
  protected readonly photos = computed<readonly FormPhoto[]>(() =>
    this.inbox.photos().map((file) => ({ file, prepared: this.prepared().get(file) ?? null })),
  );

  /** La portada: la foto que abre la ficha y alimenta el borrador. */
  private readonly cover = computed<PreparedPhoto | null>(() => this.photos()[0]?.prepared ?? null);

  /** ¿Hay alguna foto todavía optimizándose? Es la compuerta visible de la tira. */
  protected readonly optimizing = computed(() =>
    this.photos().some((photo) => photo.prepared === null),
  );

  protected readonly busy = computed(() => this.optimizing() || this.publishing());

  /** Sin fotos preparadas no hay borrador ni hay artículo: es la compuerta de las tres acciones. */
  protected readonly ready = computed(() => this.photos().length > 0 && !this.optimizing());

  /** `Publicar` y `Solo guardar` no miran `drafting()`: la IA nunca bloquea al humano. */
  protected readonly canSubmit = computed(
    () => this.ready() && this.title().trim().length > 0 && !this.publishing(),
  );

  protected readonly canDraft = computed(
    () => this.medium() !== null && !this.drafting() && !this.publishing(),
  );

  protected readonly primaryClasses = uiButtonClasses('primary');
  protected readonly secondaryClasses = uiButtonClasses('secondary');

  /**
   * El nivel de onboarding del evento que se está capturando (corte 3k). Se lee del resumen del
   * borde y no se calcula aquí: la derivación y el piso viven en `shared` y en el servidor.
   */
  protected readonly onboardingLevel = computed<OnboardingLevel>(
    () => this.session.eventById(this.eventId())?.onboardingLevel ?? 0,
  );

  /** El modelo de promoción de la pantalla; la plantilla no decide el peso de los botones. */
  private readonly promotion = computed(() => promotionFor(this.onboardingLevel()));

  protected readonly draftClasses = computed(() =>
    this.promotion().draft === 'promoted' ? this.primaryClasses : this.secondaryClasses,
  );

  protected readonly retryClasses = computed(() =>
    this.promotion().retry === 'promoted' ? this.primaryClasses : this.secondaryClasses,
  );

  /**
   * La explicación de la promoción en el propio panel (inclinaciones 6 y 10), con el texto de la
   * tabla. En el nivel máximo no hay nada que explicar y no se renderiza.
   */
  protected readonly onboardingCopy = computed(() => {
    const level = this.onboardingLevel();
    return promotionFor(level).draft === 'promoted' ? onboardingLevelCopy(level) : null;
  });

  /** La variante que viaja al borrador: la `medium` de la portada, sin recodificar. */
  protected readonly medium = computed(
    () => this.cover()?.optimized.find((entry) => entry.variant === 'medium')?.blob ?? null,
  );

  /** Los tres pesos de la portada: la tarjeta que demuestra la optimización en el dispositivo. */
  protected readonly sizes = computed<readonly SizeEntry[]>(() => {
    const cover = this.cover();
    if (cover === null) {
      return [];
    }

    return cover.optimized.map((entry) => ({
      variant: entry.variant,
      widthPx: entry.widthPx,
      heightPx: entry.heightPx,
      byteSize: entry.blob.size,
      label: sizeLabel(entry, entry.blob.size),
    }));
  });

  /** La tira tal como la pinta la pieza compartida. */
  protected readonly galleryPhotos = computed<readonly GalleryPhoto[]>(() =>
    this.photos().map((photo) => ({
      key: this.keyOf(photo.file),
      photoId: null,
      previewUrl: photo.prepared?.previewUrl ?? null,
      pending: photo.prepared === null,
    })),
  );

  constructor() {
    // La sesión de captura es la fuente del orden (cortes D12 y D13; lista ordenada desde 3e): el
    // efecto prepara las fotos nuevas y reconoce el orden que la persona eligió en la tira.
    effect(() => {
      const files = this.inbox.photos();
      const prepared = untracked(this.prepared);

      for (const file of files) {
        if (!prepared.has(file) && !this.preparing.has(file)) {
          void this.prepare(file);
        }
      }

      const alive = new Set(files);
      for (const file of prepared.keys()) {
        if (!alive.has(file)) {
          this.forget(file);
        }
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

  /** Deposita las fotos elegidas o tomadas; la sesión las pone al final de la tira. */
  protected onPicked(files: readonly File[]): void {
    this.inbox.addFiles(files);
  }

  /** El orden de la tira es el de captura: mover cambia el orden en que se adjuntan. */
  protected onMoved(event: { readonly index: number; readonly direction: -1 | 1 }): void {
    this.inbox.move(event.index, event.direction);
  }

  /**
   * Prepara una foto: la valida, la optimiza en el dispositivo y pide su ticket.
   *
   * Es el camino **único** de una foto: la elegida en la tira y la tomada con el botón `Foto` de la
   * barra (corte D12) pasan por aquí, así que las dos tienen los mismos mensajes, el mismo orden y el
   * mismo ticket. Un archivo rechazado no reemplaza la tira: se retira y el mensaje explica el motivo.
   */
  private async prepare(file: File): Promise<void> {
    this.preparing.add(file);

    try {
      const typeAccepted = (ITEM_PHOTO_CONTENT_TYPES as readonly string[]).includes(file.type);
      if (!typeAccepted) {
        this.error.set('La foto debe ser JPEG, PNG o WebP.');
        this.inbox.remove(file);
        return;
      }

      // El tope es del **archivo de la cámara**, no de lo que viaja: la original nunca sale del
      // dispositivo. Un archivo mayor se rechaza aquí, sin tocar la red.
      if (file.size > ITEM_LIMITS.photoBytes) {
        this.error.set(`La foto supera el límite de ${String(this.maxPhotoMiB)} MB.`);
        this.inbox.remove(file);
        return;
      }

      this.error.set(null);

      const optimized = await this.pipeline.optimize(file);
      const ticket = await this.pipeline.openTicket(this.eventId(), optimized);
      const previewUrl = this.previewFor(file, optimized);

      this.prepared.update((current) =>
        new Map(current).set(file, { optimized, ticket, previewUrl, attached: false }),
      );

      // Una foto nueva invalida el borrador anterior: el texto que ya hay se queda, pero el aviso
      // deja de prometer que describe la tira.
      if (this.notice() !== null) {
        this.notice.set('El borrador era de la foto anterior. Revísalo antes de publicar.');
      }
    } catch {
      this.inbox.remove(file);
      this.error.set('No se pudo procesar esta foto. Elige otra o toma una nueva.');
    } finally {
      this.preparing.delete(file);
    }
  }

  /** Olvida una foto que salió de la sesión: descarta su ticket y revoca su vista previa. */
  private forget(file: File): void {
    const current = this.prepared();
    const entry = current.get(file);
    if (entry !== undefined) {
      this.pipeline.discardTicket(this.eventId(), entry.ticket.captureId);
      const next = new Map(current);
      next.delete(file);
      this.prepared.set(next);
    }

    const url = this.previews.get(file);
    if (url !== undefined) {
      URL.revokeObjectURL(url);
      this.previews.delete(file);
    }
  }

  /**
   * Pide el borrador con la variante `medium` de la portada y rellena **solo los campos vacíos**: si
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

  /** El tap primario: crea el artículo, sube las variantes, las adjunta y publica. */
  protected publish(event: Event): void {
    event.preventDefault();
    void this.send('publish');
  }

  /** La ficha queda privada en el evento y se publica después desde `Capturados`. */
  protected saveOnly(): void {
    void this.send('save');
  }

  /**
   * Reintenta las fotos de un artículo que ya se creó. La ficha no se pierde y, si el intento pedía
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
          ? 'El servidor rechazó alguna foto. Vuelve a elegirla e inténtalo de nuevo.'
          : 'No se pudieron subir las fotos. Inténtalo de nuevo.',
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
        // La quinta petición no se intenta: sin fotos no hay publicación posible.
        this.photoFailed.set(true);
        this.error.set('El artículo se guardó, pero las fotos no. Reinténtalas.');
      } else if (step === 'publish') {
        this.error.set(
          'El artículo se guardó, pero no se pudo publicar. Inténtalo desde «Capturados».',
        );
      } else {
        this.error.set(
          code === PHOTO_INVALID
            ? 'El servidor rechazó alguna foto. Vuelve a elegirla e inténtalo de nuevo.'
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
   * Sube y adjunta la tira completa, con el **slot** de cada foto tomado de su orden: la primera es
   * la portada y las siguientes la acompañan, sin cambiar el contrato de 4g.
   */
  private async upload(itemId: string): Promise<void> {
    const photos = this.photos();

    // Un reintento que solo publica no reenvía bytes que ya están en el artículo: las capturas
    // consumidas dejaron de existir en el staging y volver a adjuntarlas fallaría con
    // `capture_incomplete`.
    if (photos.every((photo) => photo.prepared?.attached === true)) {
      return;
    }

    const uploads: PendingPhotoUpload[] = [];

    for (const [slot, photo] of photos.entries()) {
      if (photo.prepared === null) {
        throw new Error('photo-not-ready');
      }

      uploads.push({
        optimized: photo.prepared.optimized,
        slot,
        ticket: photo.prepared.ticket,
      });
    }

    await this.pipeline.attach({
      eventId: this.eventId(),
      itemId,
      photos: uploads,
      onProgress: (percent) => {
        this.progress.set(percent);
      },
    });

    this.prepared.update((current) => {
      const next = new Map<File, PreparedPhoto>();
      for (const [file, entry] of current) {
        next.set(file, { ...entry, attached: true });
      }
      return next;
    });
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
  private previewFor(file: File, optimized: readonly OptimizedPhoto[]): string | null {
    const medium = optimized.find((entry) => entry.variant === 'medium') ?? optimized[0];

    if (medium === undefined) {
      return null;
    }

    const previous = this.previews.get(file);
    if (previous !== undefined) {
      URL.revokeObjectURL(previous);
      this.previews.delete(file);
    }

    try {
      const url = URL.createObjectURL(medium.blob);
      this.previews.set(file, url);
      return url;
    } catch {
      // Sin vista previa la captura sigue sirviendo: la foto ya está optimizada.
      return null;
    }
  }

  /** Una llave estable por archivo, para que reordenar no recree la tira entera. */
  private keyOf(file: File): string {
    const existing = this.keys.get(file);
    if (existing !== undefined) {
      return existing;
    }

    const key = `photo-${String(this.nextKey)}`;
    this.nextKey += 1;
    this.keys.set(file, key);
    return key;
  }

  private clearPhoto(): void {
    this.prepared.set(new Map());

    for (const url of this.previews.values()) {
      URL.revokeObjectURL(url);
    }
    this.previews.clear();
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
   * Salir del formulario no termina la captura (corte D13): las fotos siguen en la sesión y volver al
   * panel las re-prepara. Solo se descartan los tickets y las vistas previas, que son de esta
   * instancia.
   */
  ngOnDestroy(): void {
    for (const entry of this.prepared().values()) {
      this.pipeline.discardTicket(this.eventId(), entry.ticket.captureId);
    }
    this.clearPhoto();
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
