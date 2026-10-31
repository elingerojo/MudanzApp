import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../api-base-url.token';
import { ItemFormComponent } from './item-form.component';

/**
 * La captura en la interfaz: lo que se rechaza antes de salir a la red y lo que se envía cuando la
 * ficha mínima está completa. La subida real de la foto se evidencia en el e2e, que tiene navegador.
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

  function formOf(fixture: ReturnType<typeof render>): HTMLFormElement {
    return fixture.nativeElement.querySelector('form') as HTMLFormElement;
  }

  function fill(fixture: ReturnType<typeof render>, testId: string, value: string): void {
    const input = fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`,
    ) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function errorText(fixture: ReturnType<typeof render>): string {
    const element = fixture.nativeElement.querySelector(
      '[data-testid="item-error"]',
    ) as HTMLElement | null;
    return element?.textContent ?? '';
  }

  it('refuses to save without a title and makes no request', () => {
    const fixture = render();

    formOf(fixture).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(errorText(fixture)).toContain('título');
    httpTesting.expectNone('/api/events/event-1/items');
  });

  it('rejects a measure that is not a positive number', () => {
    const fixture = render();
    fill(fixture, 'item-title-input', 'Mesa');
    fill(fixture, 'item-width-input', '0');

    formOf(fixture).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(errorText(fixture)).toContain('ancho');
    httpTesting.expectNone('/api/events/event-1/items');
  });

  it('saves the minimal article and clears the form', async () => {
    const fixture = render();
    const created = vi.fn();
    fixture.componentInstance.created.subscribe(created);

    fill(fixture, 'item-title-input', 'Mesa');
    fill(fixture, 'item-note-input', 'De madera');
    fill(fixture, 'item-weight-input', '12.5');

    formOf(fixture).dispatchEvent(new Event('submit'));

    const request = httpTesting.expectOne('/api/events/event-1/items');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ title: 'Mesa', note: 'De madera', weightKg: 12.5 });

    request.flush({
      item: {
        id: 'item-1',
        eventId: 'event-1',
        title: 'Mesa',
        note: 'De madera',
        widthCm: null,
        heightCm: null,
        depthCm: null,
        weightKg: 12.5,
        photo: null,
        createdAt: '2026-10-31T00:00:00.000Z',
      },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(created).toHaveBeenCalled();
    const title = fixture.nativeElement.querySelector(
      '[data-testid="item-title-input"]',
    ) as HTMLInputElement;
    expect(title.value).toBe('');
  });

  it('rejects a photo whose type is not declared, before uploading anything', () => {
    const fixture = render();
    const input = fixture.nativeElement.querySelector(
      '[data-testid="item-photo-input"]',
    ) as HTMLInputElement;

    const file = new File(['gif'], 'anim.gif', { type: 'image/gif' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(errorText(fixture)).toContain('JPEG');
    httpTesting.expectNone('/api/events/event-1/items');
  });
});
