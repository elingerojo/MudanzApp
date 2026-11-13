import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../api-base-url.token';
import { PhotoInboxStore } from '../events/photo-inbox.store';
import { SessionStore } from '../session/session.store';
import { PROGRESS_DONE_FLASH_MS } from '../ui/ui-progress-button/ui-progress-button';
import { ItemFormComponent } from './item-form.component';
import { PHOTO_OPTIMIZER } from './photo-optimizer.token';
import { uploadVariants, type UploadTask } from './photo-upload';
import { PHOTO_UPLOADER } from './photo-upload.token';

/**
 * La captura en la interfaz (`plan-ciclo-4g-direct-upload` §3, §5 y §8): el ticket que firma las
 * subidas, las tres variantes que viajan **directo** al almacén con su progreso ponderado, la
 * adjunción al artículo y las reglas que no cambian desde 3d —
 *
 * 1. el borrador solo se pide con un toque y no bloquea a nadie;
 * 2. la mediana que viaja al borrador es el mismo `Blob` que después se sube;
 * 3. el cuerpo de la foto no cruza el API.
 */

const blobs = {
  thumb: new Blob(['thumb-bytes'], { type: 'image/webp' }),
  medium: new Blob(['medium-bytes'], { type: 'image/webp' }),
  large: new Blob(['large-bytes'], { type: 'image/webp' }),
};

const ITEMS_URL = '/api/events/event-1/items';
const TICKET_URL = '/api/events/event-1/captures';
const DRAFTS_URL = '/api/events/event-1/ai/drafts';
const PHOTOS_URL = '/api/events/event-1/items/item-1/photos';
const LISTING_URL = '/api/events/event-1/items/item-1/listing';

const TICKET = {
  captureId: '7b0d3f43-2a4e-4f7a-9a51-0d3a1e6f5c11',
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  contentType: 'image/webp',
  // Relativas al API, como las emite el doble: el cliente pone el prefijo y ninguna prueba depende
  // de un host. En `live` llegarían absolutas y pasarían tal cual.
  uploads: {
    thumb: { url: '/__fake-r2/put?token=thumb', key: 'event-1/captures/cap/thumb' },
    medium: { url: '/__fake-r2/put?token=medium', key: 'event-1/captures/cap/medium' },
    large: { url: '/__fake-r2/put?token=large', key: 'event-1/captures/cap/large' },
  },
};

const CREATED = {
  item: {
    id: 'item-1',
    eventId: 'event-1',
    title: 'Mesa',
    note: null,
    widthCm: null,
    heightCm: null,
    depthCm: null,
    weightKg: null,
    priceCents: null,
    soldAt: null,
    photos: [],
    publishedSlug: null,
    unpublishedAt: null,
    createdAt: '2026-10-31T00:00:00.000Z',
  },
};

/** Un turno de macro-tarea: deja correr la cadena de promesas entre dos peticiones encadenadas. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('ItemFormComponent', () => {
  let httpTesting: HttpTestingController;
  let uploads: { tasks: readonly UploadTask[]; contentType: string }[];
  const onboardingLevel = signal<0 | 1>(0);

  beforeEach(async () => {
    localStorage.clear();
    uploads = [];
    onboardingLevel.set(0);

    await TestBed.configureTestingModule({
      imports: [ItemFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        {
          // El nivel lo publica el borde; el formulario solo lo lee para promover sus acciones.
          provide: SessionStore,
          useValue: { eventById: () => ({ onboardingLevel: onboardingLevel() }) },
        },
        {
          provide: PHOTO_OPTIMIZER,
          useValue: () =>
            Promise.resolve([
              { variant: 'thumb', blob: blobs.thumb, widthPx: 320, heightPx: 240 },
              { variant: 'medium', blob: blobs.medium, widthPx: 768, heightPx: 576 },
              { variant: 'large', blob: blobs.large, widthPx: 1_440, heightPx: 1_080 },
            ]),
        },
        {
          // Doble del transporte: ninguna prueba abre un `XMLHttpRequest` real.
          provide: PHOTO_UPLOADER,
          useValue: ((
            tasks: readonly UploadTask[],
            contentType: string,
            onProgress: (percent: number) => void,
          ) => {
            uploads.push({ tasks, contentType });
            onProgress(42);
            onProgress(99);

            return Promise.resolve(
              tasks.map((task) => ({
                variant: task.variant,
                widthPx: task.widthPx,
                heightPx: task.heightPx,
              })),
            );
          }) satisfies typeof uploadVariants,
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  function render() {
    const fixture = TestBed.createComponent(ItemFormComponent);
    fixture.componentRef.setInput('eventId', 'event-1');
    fixture.detectChanges();
    return fixture;
  }

  type Fixture = ReturnType<typeof render>;

  /** Deja avanzar la cadena de peticiones y repinta. */
  async function settle(fixture: Fixture): Promise<void> {
    await tick();
    fixture.detectChanges();
    await tick();
  }

  /** Espera el destello de cierre, que es lo último antes de limpiar la ficha. */
  async function flash(fixture: Fixture): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, PROGRESS_DONE_FLASH_MS + 20);
    });
    fixture.detectChanges();
    await tick();
  }

  function formOf(fixture: Fixture): HTMLFormElement {
    return fixture.nativeElement.querySelector('form') as HTMLFormElement;
  }

  function query(fixture: Fixture, testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  }

  function fill(fixture: Fixture, testId: string, value: string): void {
    const input = query(fixture, testId) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function errorText(fixture: Fixture): string {
    return query(fixture, 'item-error')?.textContent ?? '';
  }

  /** Adjunta una foto válida, espera al optimizador y deja resuelto su ticket de captura. */
  async function attachPhoto(fixture: Fixture): Promise<void> {
    const input = query(fixture, 'item-photo-input') as HTMLInputElement;
    const file = new File(['foto'], 'silla.webp', { type: 'image/webp' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));

    await settle(fixture);
    httpTesting.expectOne(TICKET_URL).flush(TICKET);
    await settle(fixture);
  }

  it('promotes the draft at level 0 and weighs both photo actions the same at level 1', () => {
    const atZero = render();
    expect(query(atZero, 'item-form-draft')?.className).toContain('bg-slate-900');
    expect(query(atZero, 'item-photo-label')?.className).not.toContain('bg-slate-900');

    onboardingLevel.set(1);
    const atOne = render();
    expect(query(atOne, 'item-form-draft')?.className).not.toContain('bg-slate-900');
    expect(query(atOne, 'item-photo-label')?.className).not.toContain('bg-slate-900');
  });

  it('refuses to publish without a title and makes no request', () => {
    const fixture = render();

    formOf(fixture).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(errorText(fixture)).toContain('título');
    httpTesting.expectNone(ITEMS_URL);
  });

  it('rejects a measure that is not a positive number', () => {
    const fixture = render();
    fill(fixture, 'item-title-input', 'Mesa');
    fill(fixture, 'item-width-input', '0');

    formOf(fixture).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(errorText(fixture)).toContain('ancho');
    httpTesting.expectNone(ITEMS_URL);
  });

  it('rejects a photo whose type is not declared, before asking for a ticket', () => {
    const fixture = render();
    const input = query(fixture, 'item-photo-input') as HTMLInputElement;

    const file = new File(['gif'], 'anim.gif', { type: 'image/gif' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(errorText(fixture)).toContain('JPEG');
    httpTesting.expectNone(TICKET_URL);
  });

  it('asks for the capture ticket as soon as the photo is optimized', async () => {
    const fixture = render();
    await attachPhoto(fixture);

    // No hay subida en la foto: el ticket sólo firma, y sigue sin tocar el almacén.
    expect(uploads).toHaveLength(0);
    expect((query(fixture, 'item-photo-sizes') as HTMLElement).children).toHaveLength(3);
  });

  it('does not offer the draft until the photo is optimized', () => {
    const fixture = render();

    expect((query(fixture, 'item-form-draft') as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks for the draft with the same medium Blob that travels to storage', async () => {
    const fixture = render();
    await attachPhoto(fixture);

    (query(fixture, 'item-form-draft') as HTMLButtonElement).click();

    const request = httpTesting.expectOne(DRAFTS_URL);
    expect(request.request.method).toBe('POST');
    // La identidad importa: es el mismo objeto, no una copia ni un base64.
    expect(request.request.body).toBe(blobs.medium);
    expect(request.request.headers.get('Content-Type')).toBe('image/webp');

    request.flush({ draft: { title: 'Silla de madera', note: 'Con respaldo alto.' } });
    await settle(fixture);

    expect((query(fixture, 'item-title-input') as HTMLInputElement).value).toBe('Silla de madera');
    expect(query(fixture, 'item-form-draft-notice')?.textContent).toContain('revísalo');
  });

  it('keeps what the human wrote when the draft comes back', async () => {
    const fixture = render();
    await attachPhoto(fixture);
    fill(fixture, 'item-title-input', 'Mi título');

    (query(fixture, 'item-form-draft') as HTMLButtonElement).click();
    httpTesting
      .expectOne(DRAFTS_URL)
      .flush({ draft: { title: 'Título de la IA', note: 'Nota de la IA.' } });
    await settle(fixture);

    expect((query(fixture, 'item-title-input') as HTMLInputElement).value).toBe('Mi título');
    expect((query(fixture, 'item-note-input') as HTMLTextAreaElement).value).toBe('Nota de la IA.');
    expect(query(fixture, 'item-form-draft-notice')?.textContent).toContain('respetó');
  });

  it('leaves publishing enabled while the draft is in flight', async () => {
    const fixture = render();
    await attachPhoto(fixture);
    fill(fixture, 'item-title-input', 'Mesa');

    (query(fixture, 'item-form-draft') as HTMLButtonElement).click();
    fixture.detectChanges();

    // La petición del borrador sigue pendiente y el humano ya puede publicar.
    expect((query(fixture, 'item-form-publish') as HTMLButtonElement).disabled).toBe(false);

    httpTesting
      .expectOne(DRAFTS_URL)
      .flush({ draft: { title: 'Borrador', note: 'Nota del borrador.' } });
    await settle(fixture);
  });

  it('sends an AI failure to the message and keeps the manual path usable', async () => {
    const fixture = render();
    await attachPhoto(fixture);
    fill(fixture, 'item-title-input', 'Mesa');

    (query(fixture, 'item-form-draft') as HTMLButtonElement).click();
    httpTesting
      .expectOne(DRAFTS_URL)
      .flush({ error: 'ai_unavailable' }, { status: 503, statusText: 'Unavailable' });
    await settle(fixture);

    expect(errorText(fixture)).toContain('La IA no respondió');
    expect((query(fixture, 'item-form-publish') as HTMLButtonElement).disabled).toBe(false);
  });

  it('uploads the three variants to their signed urls and attaches the capture', async () => {
    const fixture = render();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);

    await attachPhoto(fixture);
    fill(fixture, 'item-title-input', 'Mesa');

    formOf(fixture).dispatchEvent(new Event('submit'));
    await settle(fixture);

    httpTesting.expectOne(ITEMS_URL).flush(CREATED);
    await settle(fixture);

    // Las URL salen del ticket y el prefijo del API las resuelve: no hay ninguna ruta de subida
    // propia del borde.
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.contentType).toBe('image/webp');
    expect(uploads[0]?.tasks.map((task) => task.url)).toEqual([
      '/api/__fake-r2/put?token=thumb',
      '/api/__fake-r2/put?token=medium',
      '/api/__fake-r2/put?token=large',
    ]);
    expect(uploads[0]?.tasks.map((task) => task.blob)).toEqual([
      blobs.thumb,
      blobs.medium,
      blobs.large,
    ]);

    // Mientras se adjunta, el botón pulsado muestra el 99 % y no se puede repetir.
    const publish = query(fixture, 'item-form-publish') as HTMLButtonElement;
    expect(publish.textContent?.trim()).toBe('99%');
    expect(publish.disabled).toBe(true);
    expect(publish.getAttribute('aria-busy')).toBe('true');

    const attach = httpTesting.expectOne(PHOTOS_URL);
    expect(attach.request.method).toBe('POST');
    expect(attach.request.body).toEqual({
      captures: [
        {
          captureId: TICKET.captureId,
          slot: 0,
          variants: [
            { variant: 'thumb', widthPx: 320, heightPx: 240 },
            { variant: 'medium', widthPx: 768, heightPx: 576 },
            { variant: 'large', widthPx: 1_440, heightPx: 1_080 },
          ],
        },
      ],
    });
    attach.flush({ photos: [{ id: 'photo-1', sizes: {} }] });
    await settle(fixture);

    httpTesting.expectOne(LISTING_URL).flush({ slug: 'mesa-3f9a2c', path: '/mesa-3f9a2c' });
    await settle(fixture);
    await flash(fixture);

    expect(saved).toHaveBeenCalledWith('mesa-3f9a2c');
    expect((query(fixture, 'item-title-input') as HTMLInputElement).value).toBe('');
  });

  it('saves without publishing and returns null', async () => {
    const fixture = render();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);

    await attachPhoto(fixture);
    fill(fixture, 'item-title-input', 'Mesa');

    (query(fixture, 'item-form-save-only') as HTMLButtonElement).click();
    await settle(fixture);

    httpTesting.expectOne(ITEMS_URL).flush(CREATED);
    await settle(fixture);

    httpTesting.expectOne(PHOTOS_URL).flush({ photos: [] });
    await settle(fixture);
    await flash(fixture);

    expect(saved).toHaveBeenCalledWith(null);
    // Guardar termina la captura: la barra deshabilita `Captura` (corte D13).
    expect(TestBed.inject(PhotoInboxStore).peek()).toEqual([]);
    httpTesting.expectNone(LISTING_URL);
  });

  it('keeps the ficha and offers a photo retry when the attach fails', async () => {
    const fixture = render();
    await attachPhoto(fixture);
    fill(fixture, 'item-title-input', 'Mesa');

    (query(fixture, 'item-form-save-only') as HTMLButtonElement).click();
    await settle(fixture);

    httpTesting.expectOne(ITEMS_URL).flush(CREATED);
    await settle(fixture);

    httpTesting
      .expectOne(PHOTOS_URL)
      .flush({ error: 'r2_unavailable' }, { status: 503, statusText: 'Unavailable' });
    await settle(fixture);

    expect(errorText(fixture)).toContain('las fotos no');
    expect(query(fixture, 'item-form-photo-failed')).not.toBeNull();
    // La ficha no se pierde: el título sigue donde el humano lo dejó.
    expect((query(fixture, 'item-title-input') as HTMLInputElement).value).toBe('Mesa');
  });

  it('retries only the photo, without creating the article twice', async () => {
    const fixture = render();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);

    await attachPhoto(fixture);
    fill(fixture, 'item-title-input', 'Mesa');

    (query(fixture, 'item-form-save-only') as HTMLButtonElement).click();
    await settle(fixture);

    httpTesting.expectOne(ITEMS_URL).flush(CREATED);
    await settle(fixture);

    httpTesting
      .expectOne(PHOTOS_URL)
      .flush({ error: 'r2_unavailable' }, { status: 503, statusText: 'Unavailable' });
    await settle(fixture);

    (query(fixture, 'item-form-retry-photo') as HTMLButtonElement).click();
    await settle(fixture);

    // No hay segundo alta: el artículo ya existía.
    httpTesting.expectNone(ITEMS_URL);
    httpTesting.expectOne(PHOTOS_URL).flush({ photos: [] });
    await settle(fixture);
    await flash(fixture);

    expect(saved).toHaveBeenCalledWith(null);
  });

  it('reuses the photo of the capture session without losing what is written', async () => {
    const fixture = render();
    fill(fixture, 'item-title-input', 'Bicicleta');

    const file = new File(['barra'], 'barra.webp', { type: 'image/webp' });
    TestBed.inject(PhotoInboxStore).addFiles([file]);
    await settle(fixture);

    // Mismo camino que una foto elegida en el panel: optimiza, pide su ticket y no sube nada.
    httpTesting.expectOne(TICKET_URL).flush(TICKET);
    await settle(fixture);

    expect(query(fixture, 'photo-gallery-strip')).not.toBeNull();
    expect(query(fixture, 'photo-gallery-preview')).not.toBeNull();
    expect((query(fixture, 'item-photo-sizes') as HTMLElement).children).toHaveLength(3);
    expect((query(fixture, 'item-title-input') as HTMLInputElement).value).toBe('Bicicleta');
    // La foto sigue en la sesión: volver al panel la reutiliza (corte D13).
    expect(TestBed.inject(PhotoInboxStore).peek()).toEqual([file]);
  });

  it('rejects a photo from the session with the same message and ends an empty capture', async () => {
    const fixture = render();

    TestBed.inject(PhotoInboxStore).addFiles([
      new File(['gif'], 'anim.gif', { type: 'image/gif' }),
    ]);
    await settle(fixture);

    expect(errorText(fixture)).toContain('JPEG');
    httpTesting.expectNone(TICKET_URL);
    // No había foto válida: la sesión se cierra para que `Captura` vuelva a deshabilitarse.
    expect(TestBed.inject(PhotoInboxStore).peek()).toEqual([]);
  });
});
