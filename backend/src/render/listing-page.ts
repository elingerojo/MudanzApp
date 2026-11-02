import { listingPageModel, type EventCardImage, type PublicListing } from '@mudanzapp/shared';

/**
 * Renderizador del snapshot de la ficha pública (ciclo 4b, `item-edit`).
 *
 * Devuelve el **fragmento** que el Worker incrusta en la shell de la SPA: el `<meta>` con la clave de
 * versión y el contenedor `#ficha-snapshot` con la ficha ya pintada. El visitante y el crawler leen
 * el artículo antes de que arranque el JavaScript; el componente de Angular retira el contenedor
 * cuando su propio modelo está en el DOM.
 *
 * Reglas del corte:
 * - recibe **solo** `PublicListing` y consume [`listingPageModel()`](shared/src/listing-page.ts:1):
 *   no consulta la base ni compone un texto por su cuenta, que es lo que mantiene la paridad;
 * - el snapshot vive **fuera** de `<app-root>`; por eso el contenedor es un hermano y no un hijo;
 * - nada personal entra aquí: sin sesión, sin carrito y sin marcas de visitante.
 */

// Las entidades se escriben con escapes de un solo carácter para que ningún editor las normalice.
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '\u0026amp;',
  '<': '\u0026lt;',
  '>': '\u0026gt;',
  '"': '\u0026quot;',
  "'": '\u0026#39;',
};

/** Escapa todo texto que venga de la base: el título y la nota son entrada del usuario. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

function renderImage(image: EventCardImage, testId: string, alt: string): string {
  const base =
    `<img class="w-full rounded-lg bg-slate-100 object-cover" data-testid="${testId}"` +
    ` src="${escapeHtml(image.src)}"`;

  if (image.width <= 0 || image.height <= 0) {
    return `${base} alt="${escapeHtml(alt)}" />`;
  }

  return (
    `${base} srcset="${escapeHtml(image.srcset)}" sizes="${escapeHtml(image.sizes)}"` +
    ` width="${String(image.width)}" height="${String(image.height)}"` +
    ` alt="${escapeHtml(alt)}" />`
  );
}

function renderPhoto(model: ReturnType<typeof listingPageModel>): string {
  const photo = model.photo;
  if (photo === null) {
    return '';
  }

  const medium = photo.medium;
  const thumb = photo.thumb;

  return [
    '<div class="space-y-3" data-testid="listing-gallery">',
    medium === null
      ? ''
      : [
          '<figure>',
          '<button type="button" class="block w-full cursor-zoom-in"' +
            ' data-testid="listing-photo-trigger" aria-label="Ver la foto en tamaño grande">',
          renderImage(medium, 'listing-photo', model.alt),
          '</button>',
          `<figcaption class="mt-1 text-xs text-slate-500" data-testid="listing-photo-medium">${String(medium.width)} px</figcaption>`,
          '</figure>',
        ].join('\n'),
    thumb === null
      ? ''
      : [
          '<figure class="w-24">',
          renderImage(thumb, 'listing-photo-thumb', model.alt),
          `<figcaption class="text-xs text-slate-500" data-testid="listing-photo-thumb-label">${String(thumb.width)} px</figcaption>`,
          '</figure>',
        ].join('\n'),
    '</div>',
  ]
    .filter((part) => part.length > 0)
    .join('\n');
}

/**
 * El fragmento del snapshot: metadatos de versión más la ficha. El `<meta>` queda fuera del
 * contenedor a propósito: el componente lo lee para decidir y luego retira `#ficha-snapshot`.
 */
export function renderListingPage(payload: PublicListing): string {
  const model = listingPageModel(payload);

  return [
    `<meta name="listing-version" content="${escapeHtml(payload.version)}">`,
    '<div class="mx-auto w-full max-w-2xl p-6" id="ficha-snapshot" data-testid="listing-snapshot">',
    '<article class="space-y-4" data-testid="listing">',
    '<header class="space-y-1">',
    `<h1 class="text-xl font-semibold text-slate-900" data-testid="listing-title">${escapeHtml(model.title)}</h1>`,
    `<p class="text-sm text-slate-600" data-testid="listing-event">${escapeHtml(model.citiesLabel)}</p>`,
    `<a class="inline-block text-sm text-slate-700 underline" data-testid="listing-event-link" href="${escapeHtml(model.eventHref)}">Ver todo el evento</a>`,
    '</header>',
    `<p class="text-base font-semibold text-slate-900" data-testid="listing-price">${escapeHtml(model.priceLabel)}</p>`,
    model.soldLabel === null
      ? ''
      : `<p class="inline-block rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white" data-testid="listing-sold">${escapeHtml(model.soldLabel)}</p>`,
    renderPhoto(model),
    model.measuresLabel === null
      ? ''
      : `<p class="text-sm text-slate-700" data-testid="listing-measures">${escapeHtml(model.measuresLabel)}</p>`,
    model.note === null
      ? ''
      : `<p class="text-sm text-slate-700" data-testid="listing-note">${escapeHtml(model.note)}</p>`,
    `<p class="text-xs text-slate-500" data-testid="listing-published-at">${escapeHtml(model.publishedLabel)}</p>`,
    '</article>',
    '</div>',
  ]
    .filter((part) => part.length > 0)
    .join('\n');
}
