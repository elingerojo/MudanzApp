import type { ItemSummary } from '@mudanzapp/shared';

/**
 * Estado visible del artículo, con una sola fuente (ciclo 4b y 4c-4).
 *
 * Lo comparten `Capturados` y el dashboard: si una pantalla dijera «publicado» y la otra «en
 * proceso», el mismo hecho tendría dos respuestas. `vendido` manda sobre `publicado` porque la venta
 * es el último hecho del artículo; un artículo sin `publishedSlug` sigue «en proceso».
 */
export function itemStatusLabel(item: ItemSummary): string {
  if (item.soldAt !== null) {
    return 'vendido';
  }

  return item.publishedSlug === null ? 'en proceso' : 'publicado';
}

export function itemStatusClasses(item: ItemSummary): string {
  if (item.soldAt !== null) {
    return 'bg-slate-200 text-slate-800';
  }

  return item.publishedSlug === null
    ? 'bg-amber-100 text-amber-900'
    : 'bg-emerald-100 text-emerald-900';
}
