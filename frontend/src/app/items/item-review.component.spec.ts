import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ItemSummary } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { ItemReviewComponent } from './item-review.component';

/**
 * La revisión humana (`plan-ciclo-3d` §8): el borrador rellena lo vacío, **no** sobrescribe lo que el
 * humano escribió, el `PATCH` lleva exactamente lo que quedó en el formulario y un fallo de la IA deja
 * la revisión manual disponible. La calidad del borrador no se prueba aquí: el doble es determinista.
 */
const ITEM: ItemSummary = {
  id: 'item-1',
  eventId: 'event-1',
  title: 'Título de trabajo',
  note: null,
  widthCm: null,
  heightCm: null,
  depthCm: null,
  weightKg: null,
  photo: {
    id: 'photo-1',
    sizes: { thumb: null, medium: { widthPx: 768, heightPx: 1_024 }, large: null },
  },
  createdAt: '2026-11-01T00:00:00.000Z',
};

const DRAFT = { title: 'Refrigerador', note: 'Refrigerador de dos puertas con imanes.' };

describe('ItemReviewComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ItemReviewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  function render() {
    const fixture = TestBed.createComponent(ItemReviewComponent);
    fixture.componentRef.setInput('eventId', 'event-1');
    fixture.componentRef.setInput('item', ITEM);
    fixture.detectChanges();
    return fixture;
  }

  function element(fixture: ReturnType<typeof render>, testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  }

  async function askForDraft(fixture: ReturnType<typeof render>): Promise<void> {
    element(fixture, 'item-review-draft')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function fill(fixture: ReturnType<typeof render>, testId: string, value: string): void {
    const input = element(fixture, testId) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('shows the stored ficha as context and starts the review with empty fields', () => {
    const fixture = render();

    expect(element(fixture, 'item-review-current-title')?.textContent).toContain(
      'Título de trabajo',
    );
    expect((element(fixture, 'item-review-title') as HTMLInputElement).value).toBe('');
    expect((element(fixture, 'item-review-note') as HTMLTextAreaElement).value).toBe('');
  });

  it('fills the empty fields with the draft and explains that it must be reviewed', async () => {
    const fixture = render();

    element(fixture, 'item-review-draft')?.click();
    httpTesting.expectOne('/api/events/event-1/items/item-1/draft').flush({ draft: DRAFT });
    await fixture.whenStable();
    fixture.detectChanges();

    expect((element(fixture, 'item-review-title') as HTMLInputElement).value).toBe(DRAFT.title);
    expect((element(fixture, 'item-review-note') as HTMLTextAreaElement).value).toBe(DRAFT.note);
    expect(element(fixture, 'item-review-draft-notice')?.textContent).toContain(
      'revísalo antes de guardar',
    );
  });

  it('does not overwrite what the human already wrote', async () => {
    const fixture = render();
    fill(fixture, 'item-review-title', 'Mi título');

    await askForDraft(fixture);
    httpTesting.expectOne('/api/events/event-1/items/item-1/draft').flush({ draft: DRAFT });
    await fixture.whenStable();
    fixture.detectChanges();

    expect((element(fixture, 'item-review-title') as HTMLInputElement).value).toBe('Mi título');
    // La nota estaba vacía, así que sí se rellena.
    expect((element(fixture, 'item-review-note') as HTMLTextAreaElement).value).toBe(DRAFT.note);
    expect(element(fixture, 'item-review-draft-notice')?.textContent).toContain('respetó lo tuyo');
  });

  it('sends exactly what the human left in the form', async () => {
    const fixture = render();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);

    fill(fixture, 'item-review-title', 'Silla blanca');
    fill(fixture, 'item-review-note', '');

    element(fixture, 'item-review-form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const request = httpTesting.expectOne('/api/events/event-1/items/item-1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ title: 'Silla blanca', note: '' });

    request.flush({ item: { ...ITEM, title: 'Silla blanca' } });
    await fixture.whenStable();

    expect(saved).toHaveBeenCalled();
  });

  it('refuses to save without a title and makes no request', () => {
    const fixture = render();

    element(fixture, 'item-review-form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(element(fixture, 'item-review-error')?.textContent).toContain('título');
    httpTesting.expectNone('/api/events/event-1/items/item-1');
  });

  it('reports an unavailable provider by code and keeps the manual review usable', async () => {
    const fixture = render();

    element(fixture, 'item-review-draft')?.click();
    httpTesting
      .expectOne('/api/events/event-1/items/item-1/draft')
      .flush({ error: 'ai_unavailable' }, { status: 503, statusText: 'Service Unavailable' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element(fixture, 'item-review-error')?.textContent).toContain('La IA no respondió');

    fill(fixture, 'item-review-title', 'Escrito a mano');
    expect((element(fixture, 'item-review-save') as HTMLButtonElement).disabled).toBe(false);
  });
});
