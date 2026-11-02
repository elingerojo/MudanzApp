import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { EventCardEntry, PublicEventIndex } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { EventIndexComponent } from './event-index.component';

/**
 * El índice público del evento (ciclo 4a, `plan-ciclo-4a` §7).
 *
 * Lo que se prueba es la decisión del componente sobre el snapshot: con la misma versión lo retira
 * sin reemplazar nada; con una versión distinta la lista nueva ocupa su celda. También el estado
 * vacío y el marcador de la tarjeta sin miniatura.
 */
const SLUG = 'bogota-ciudad-de-mexico-3f9a2c';

const WITH_THUMB: EventCardEntry = {
  slug: 'silla-de-madera-3f9a2c',
  title: 'Silla de madera',
  publishedAt: '2026-10-31T12:00:00.000Z',
  thumb: {
    url: 'https://fake.r2.local/event/item/uuid-thumb',
    widthPx: 320,
    heightPx: 240,
  },
};

const WITHOUT_THUMB: EventCardEntry = {
  slug: 'mesa-de-roble-4a1b3c',
  title: 'Mesa de roble',
  publishedAt: '2026-10-30T12:00:00.000Z',
  thumb: null,
};

function payload(version: string, listings: readonly EventCardEntry[]): PublicEventIndex {
  return {
    version,
    event: {
      publicSlug: SLUG,
      originCity: 'Bogotá',
      destinationCity: 'Ciudad de México',
      currency: 'MXN',
    },
    listings,
  };
}

interface SnapshotProbe {
  snapshot(): 'absent' | 'retired' | 'replaced';
}

describe('EventIndexComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventIndexComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ publicSlug: SLUG }) } },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    document.getElementById('evento-snapshot')?.remove();
    document.querySelector('meta[name="event-version"]')?.remove();
  });

  /** Simula lo que el Worker dejó en el documento: el `<meta>` y el contenedor hermano. */
  function embedSnapshot(version: string): HTMLElement {
    const meta = document.createElement('meta');
    meta.name = 'event-version';
    meta.content = version;
    document.head.append(meta);

    const container = document.createElement('div');
    container.id = 'evento-snapshot';
    container.innerHTML = '<article data-testid="event-index-card">viejo</article>';
    document.body.append(container);

    return container;
  }

  async function render(body: PublicEventIndex) {
    const fixture = TestBed.createComponent(EventIndexComponent);
    fixture.detectChanges();

    httpTesting.expectOne(`/api/public/events/${SLUG}`).flush(body);

    await fixture.whenStable();
    fixture.detectChanges();

    return fixture;
  }

  function elementOf(fixture: { nativeElement: unknown }): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function snapshotOf(fixture: { componentInstance: unknown }): string {
    return (fixture.componentInstance as SnapshotProbe).snapshot();
  }

  it('retires the snapshot without replacing the list when the version matches', async () => {
    const container = embedSnapshot('v1');

    const fixture = await render(payload('v1', [WITH_THUMB]));

    expect(document.getElementById('evento-snapshot')).toBeNull();
    expect(container.isConnected).toBe(false);
    expect(snapshotOf(fixture)).toBe('retired');
    expect(elementOf(fixture).querySelectorAll('[data-testid="event-index-card"]')).toHaveLength(1);
  });

  it('replaces the list in its cell when the embedded version differs', async () => {
    embedSnapshot('vieja');

    const fixture = await render(payload('nueva', [WITH_THUMB, WITHOUT_THUMB]));

    expect(document.getElementById('evento-snapshot')).toBeNull();
    expect(snapshotOf(fixture)).toBe('replaced');

    const element = elementOf(fixture);
    expect(element.querySelector('[data-testid="event-index-card-title"]')?.textContent).toContain(
      'Silla de madera',
    );
    expect(element.querySelectorAll('[data-testid="event-index-card"]')).toHaveLength(2);
  });

  it('does nothing to a document that never had a snapshot', async () => {
    const fixture = await render(payload('v1', [WITH_THUMB]));

    expect(snapshotOf(fixture)).toBe('absent');
  });

  it('shows the empty state with the event cities', async () => {
    const fixture = await render(payload('v1', []));
    const element = elementOf(fixture);

    expect(element.querySelector('[data-testid="event-index-cities"]')?.textContent).toContain(
      'Bogotá',
    );
    expect(element.querySelector('[data-testid="event-index-empty"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="event-index-list"]')).toBeNull();
  });

  it('renders the thumbnail placeholder for an article without a thumb variant', async () => {
    const fixture = await render(payload('v1', [WITHOUT_THUMB]));
    const element = elementOf(fixture);
    const thumb = element.querySelector('[data-testid="event-index-card-thumb"]');

    expect(thumb?.tagName.toLowerCase()).toBe('div');
    expect(
      element.querySelector('[data-testid="event-index-card-published"]')?.textContent,
    ).toContain('Publicado el 2026-10-30');
  });

  it('shows the unavailable state for a slug that does not exist', async () => {
    const fixture = TestBed.createComponent(EventIndexComponent);
    fixture.detectChanges();

    httpTesting
      .expectOne(`/api/public/events/${SLUG}`)
      .flush({ error: 'not_found' }, { status: 404, statusText: 'Not Found' });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      elementOf(fixture).querySelector('[data-testid="event-index-not-found"]'),
    ).not.toBeNull();
  });
});
