import { cardModel, type EventCardModel, type PublicEventIndex } from '@mudanzapp/shared';

/**
 * Renderizador del snapshot del índice público (ciclo 4a, `event-index`).
 *
 * Devuelve el **fragmento** que el Worker incrusta en la shell de la SPA: el `<meta>` con la clave de
 * versión y el contenedor `#evento-snapshot` con las tarjetas ya pintadas. Así el visitante y el
 * crawler leen el evento antes de que arranque el JavaScript; el componente de Angular retira el
 * contenedor cuando su propia lista está al día (`plan-ciclo-4a` §4).
 *
 * Reglas del corte:
 * - recibe **solo** `PublicEventIndex` y consume [`cardModel()`](shared/src/card.ts:1): no consulta
 *   la base ni compone un texto por su cuenta, que es lo que mantiene la paridad con Angular;
 * - el snapshot vive **fuera** de `<app-root>`; por eso el contenedor es un hermano y no un hijo;
 * - nada personal entra aquí: sin sesión, sin carrito y sin marcas de visitante (§4).
 *
 * El servidor no es Angular, así que no usa `NgOptimizedImage`: escribe el `<img>` con `srcset`,
 * `sizes` y las dimensiones **reales** que ya resolvió `cardModel`.
 */

// Las entidades se escriben con escapes de un solo carácter para que ningún editor las normalice.
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '\u0026amp;',
  '<': '\u0026lt;',
  '>': '\u0026gt;',
  '"': '\u0026quot;',
  "'": '\u0026#39;',
};

/** Escapa todo texto que venga de la base: el título de un artículo es entrada del usuario. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

function renderMedia(card: EventCardModel): string {
  const image = card.image;
  if (image === null) {
    return '<div class="h-40 w-full rounded-lg bg-slate-100" data-testid="event-index-card-thumb"></div>';
  }

  return (
    `<img class="h-40 w-full rounded-lg bg-slate-100 object-cover" data-testid="event-index-card-thumb"` +
    ` src="${escapeHtml(image.src)}" srcset="${escapeHtml(image.srcset)}"` +
    ` sizes="${escapeHtml(image.sizes)}" width="${String(image.width)}"` +
    ` height="${String(image.height)}" alt="${escapeHtml(card.alt)}" />`
  );
}

function renderCard(card: EventCardModel): string {
  return [
    '<li>',
    `<article class="space-y-2" data-testid="event-index-card" data-slug="${escapeHtml(card.slug)}">`,
    '<a class="block space-y-2"',
    ` data-testid="event-index-card-link" href="${escapeHtml(card.href)}">`,
    renderMedia(card),
    `<h2 class="text-sm font-medium text-slate-900" data-testid="event-index-card-title">${escapeHtml(card.title)}</h2>`,
    `<p class="text-xs text-slate-500" data-testid="event-index-card-published">${escapeHtml(card.publishedLabel)}</p>`,
    '</a>',
    '</article>',
    '</li>',
  ].join('\n');
}

/**
 * El fragmento del snapshot: metadatos de versión más el contenedor con la grilla.
 *
 * El `<meta>` queda **fuera** del contenedor a propósito: el componente lo lee para decidir y luego
 * retira `#evento-snapshot`, así que la versión sigue en el documento mientras la lista ya es la del
 * cliente.
 */
export function renderEventIndexPage(payload: PublicEventIndex): string {
  const cards = payload.listings.map(cardModel).map(renderCard).join('\n');

  return [
    `<meta name="event-version" content="${escapeHtml(payload.version)}">`,
    '<div class="mx-auto w-full max-w-2xl p-6" id="evento-snapshot" data-testid="event-index-snapshot">',
    '<header class="space-y-1">',
    `<h1 class="text-xl font-semibold text-slate-900" data-testid="event-index-cities">${escapeHtml(payload.event.originCity)} → ${escapeHtml(payload.event.destinationCity)}</h1>`,
    '</header>',
    '<ul class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="event-index-list">',
    cards,
    '</ul>',
    '</div>',
  ].join('\n');
}
