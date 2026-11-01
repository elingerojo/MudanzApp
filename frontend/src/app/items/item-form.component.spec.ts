import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../api-base-url.token';
import { ItemFormComponent } from './item-form.component';
import { PHOTO_OPTIMIZER } from './photo-optimizer.token';

/**
 * El `Blob` de la variante `medium` es el mismo objeto que viaja al borrador y a R2: el optimizador
 * se sustituye por un doble detrás de su token, así que la identidad del cuerpo se puede afirmar.
 */
const mockMedium = new Blob(['webp-bytes'], { type: 'image/webp' });

const ITEMS_URL = '/api/events/event-1/items';
const DRAFTS_URL = '/api/events/event-1/ai/drafts';
const UPLOAD_URL = '/api/events/event-1/items/item-1/photo?variant=medium&w=768&h=512';
const LISTING_URL = '/api/events/event-1/items/item-1/listing';

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
    photo: null,
    publishedSlug: null,
    createdAt: '2026-10-31T00:00:00.000Z',
  },
};

/** Un turno de macro-tarea: deja correr la cadena de promesas entre dos peticiones encadenadas. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * La captura en la interfaz (`plan-ciclo-3d` §6 y §9): lo que se rechaza antes de salir a la red, lo
 * que se envía cuando la ficha está completa, y las tres reglas del corte —
 *
 * 1. el borrador solo se pide con un toque;
 * 2. envía el mismo `Blob` de la mediana que después se sube, sin base64 ni recodificar;
 * 3. la IA nunca bloquea a la persona: `Publicar` no depende de que el borrador haya vuelto.
 */
describe('ItemFormComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ItemFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        {
          provide: PHOTO_OPTIMIZER,
          useValue: () =>
            Promise.resolve([{ variant: 'medium', blob: mockMedium, widthPx: 768, heightPx: 512 }]),
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

  /** Adjunta una foto válida y espera a que el doble del optimizador entregue sus tamaños. */
  async function attachPhoto(fixture: Fixture): Promise<void> {
    const input = query(fixture, 'item-photo-input') as HTMLInputElement;
    const file = new File(['foto'], 'silla.webp', { type: 'image/webp' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));

    await settle(fixture);
  }

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

  it('rejects a photo whose type is not declared, before uploading anything', () => {
    const fixture = render();
    const input = query(fixture, 'item-photo-input') as HTMLInputElement;

    const file = new File(['gif'], 'anim.gif', { type: 'image/gif' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(errorText(fixture)).toContain('JPEG');
    httpTesting.expectNone(ITEMS_URL);
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
    expect(request.request.body).toBe(mockMedium);
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

  it('publishes: creates the article, uploads the photo and returns the slug', async () => {
    const fixture = render();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);

    await attachPhoto(fixture);
    fill(fixture, 'item-title-input', 'Mesa');

    formOf(fixture).dispatchEvent(new Event('submit'));
    await settle(fixture);

    const create = httpTesting.expectOne(ITEMS_URL);
    expect(create.request.method).toBe('POST');
    create.flush(CREATED);
    await settle(fixture);

    const upload = httpTesting.expectOne(UPLOAD_URL);
    expect(upload.request.method).toBe('PUT');
    expect(upload.request.body).toBe(mockMedium);
    upload.flush({ photo: { id: 'photo-1', sizes: {} } });
    await settle(fixture);

    httpTesting.expectOne(LISTING_URL).flush({ slug: 'mesa-3f9a2c', path: '/mesa-3f9a2c' });
    await settle(fixture);

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

    httpTesting.expectOne(UPLOAD_URL).flush({ photo: { id: 'photo-1', sizes: {} } });
    await settle(fixture);

    expect(saved).toHaveBeenCalledWith(null);
    httpTesting.expectNone(LISTING_URL);
  });

  it('keeps the ficha and offers a photo retry when the upload fails', async () => {
    const fixture = render();
    await attachPhoto(fixture);
    fill(fixture, 'item-title-input', 'Mesa');

    (query(fixture, 'item-form-save-only') as HTMLButtonElement).click();
    await settle(fixture);

    httpTesting.expectOne(ITEMS_URL).flush(CREATED);
    await settle(fixture);

    httpTesting
      .expectOne(UPLOAD_URL)
      .flush({ error: 'r2_unavailable' }, { status: 503, statusText: 'Unavailable' });
    await settle(fixture);

    expect(errorText(fixture)).toContain('la foto no');
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
      .expectOne(UPLOAD_URL)
      .flush({ error: 'r2_unavailable' }, { status: 503, statusText: 'Unavailable' });
    await settle(fixture);

    (query(fixture, 'item-form-retry-photo') as HTMLButtonElement).click();
    await settle(fixture);

    // No hay segundo alta: el artículo ya existía.
    httpTesting.expectNone(ITEMS_URL);
    httpTesting.expectOne(UPLOAD_URL).flush({ photo: { id: 'photo-1', sizes: {} } });
    await settle(fixture);

    expect(saved).toHaveBeenCalledWith(null);
  });
});
