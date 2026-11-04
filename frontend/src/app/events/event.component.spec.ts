import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
  type UrlTree,
} from '@angular/router';

import { API_BASE_URL } from '../api-base-url.token';
import { SessionStore } from '../session/session.store';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { EventComponent } from './event.component';

/**
 * El marco de la sección (`plan-ciclo-3d` §5): dos pestañas enlazables, el contador de `Capturados`
 * —que sale del mismo recurso que pinta la lista— y el aviso de la pestaña que no se abrió.
 *
 * El aviso es lo que el diagnóstico del borde (2026-11-04) cambió: antes cualquier fallo producía la
 * misma frase de autorización, que es una afirmación que un `500` no sostiene. Ahora la familia viaja
 * en la URL y el marco la traduce.
 *
 * La sesión se sustituye por un doble: lo que se prueba es el marco, y su `SessionStore` haría una
 * petición de identidad que aquí no aporta nada.
 */
const ITEM = {
  id: 'item-1',
  eventId: 'event-1',
  title: 'Mesa de roble',
  note: null,
  widthCm: null,
  heightCm: null,
  depthCm: null,
  weightKg: null,
  priceCents: null,
  soldAt: null,
  photo: null,
  publishedSlug: null,
  createdAt: '2026-10-31T00:00:00.000Z',
};

describe('EventComponent', () => {
  let httpTesting: HttpTestingController;
  let identityFailed: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    identityFailed = signal(false);

    await TestBed.configureTestingModule({
      imports: [EventComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: SHOP_BASE_URL, useValue: 'http://shop.test' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ eventId: 'event-1' }) } },
        },
        {
          provide: SessionStore,
          useValue: { eventById: () => null, identityFailed },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
  });

  function render() {
    const fixture = TestBed.createComponent(EventComponent);
    fixture.detectChanges();
    return fixture;
  }

  /**
   * Monta el marco con la URL que el guard habría escrito. El `Router` es el real —las directivas
   * `routerLink` lo necesitan— y solo se sustituyen la URL y su lectura: `parseUrl` y `url` son las dos
   * fuentes que el aviso consulta.
   */
  function renderWith(query: string) {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue(`/eventos/event-1/capturados${query}`);
    vi.spyOn(router, 'parseUrl').mockReturnValue({
      queryParams: Object.fromEntries(new URLSearchParams(query.replace(/^\?/, ''))),
    } as unknown as UrlTree);

    const fixture = render();
    httpTesting.expectOne('/api/events/event-1/items').flush({ items: [] });
    fixture.detectChanges();
    return fixture;
  }

  function notice(fixture: ReturnType<typeof render>): string | null {
    const element = fixture.nativeElement.querySelector(
      '[data-testid="event-dashboard-denied"]',
    ) as HTMLElement | null;
    return element?.textContent ?? null;
  }

  it('offers the two tabs of the section', () => {
    const fixture = render();
    httpTesting.expectOne('/api/events/event-1/items').flush({ items: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="event-tab-capture"]')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="event-tab-captured"]'),
    ).not.toBeNull();
  });

  it('counts the articles in the Capturados tab from the same read as the list', async () => {
    const fixture = render();
    httpTesting.expectOne('/api/events/event-1/items').flush({ items: [ITEM] });

    await fixture.whenStable();
    fixture.detectChanges();

    const captured = fixture.nativeElement.querySelector(
      '[data-testid="event-tab-captured"]',
    ) as HTMLElement;
    expect(captured.textContent).toContain('Capturados (1)');
  });

  it('keeps the warning visible when the session is no longer valid', async () => {
    identityFailed.set(true);

    const fixture = render();
    httpTesting.expectOne('/api/events/event-1/items').flush({ items: [ITEM] });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="event-session-invalid"]'),
    ).not.toBeNull();
  });

  it('names the refusal the border declared, without inventing who administers', () => {
    const fixture = renderWith('?denied=dashboard&reason=forbidden');

    expect(notice(fixture)).toContain('esta cuenta no administra el evento');
    expect(notice(fixture)).toContain('puede que nadie lo haya reclamado');
  });

  it('says the event is not among the session ones when that is what the border answered', () => {
    const fixture = renderWith('?denied=dashboard&reason=not_found');

    expect(notice(fixture)).toContain('no aparece entre los de tu sesión');
  });

  it('does not pass a failed read off as a refusal', () => {
    const fixture = renderWith('?denied=dashboard&reason=unavailable');

    expect(notice(fixture)).toContain('No se pudo leer el panel');
    expect(notice(fixture)).not.toContain('no administra');
  });

  it('keeps the meaning of a URL written before the diagnosis: a refusal', () => {
    const fixture = renderWith('?denied=dashboard');

    expect(notice(fixture)).toContain('esta cuenta no administra el evento');
  });

  it('shows no notice when the URL carries no denial', () => {
    const fixture = renderWith('');

    expect(notice(fixture)).toBeNull();
  });
});
