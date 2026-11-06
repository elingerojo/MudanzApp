import type { ItemSummary } from '@mudanzapp/shared';

/**
 * Estado visible del artículo, con una sola fuente (ciclo 4b, 4c-4 y F3).
 *
 * Lo comparten `Capturados` y el dashboard: si una pantalla dijera «publicado» y la otra «en
 * proceso», el mismo hecho tendría dos respuestas. `vendido` manda sobre todo porque la venta es el
 * último hecho del artículo; después, una ficha con `unpublishedAt` está **despublicada** y no a la
 * vista, aunque conserve su `publishedSlug`. Un artículo sin `publishedSlug` sigue «en proceso».
 */
export function itemStatusLabel(item: ItemSummary): string {
  if (item.soldAt !== null) {
    return 'vendido';
  }

  if (item.unpublishedAt !== null) {
    return 'despublicado';
  }

  return item.publishedSlug === null ? 'en proceso' : 'publicado';
}

export function itemStatusClasses(item: ItemSummary): string {
  if (item.soldAt !== null) {
    return 'bg-slate-200 text-slate-800';
  }

  if (item.unpublishedAt !== null) {
    return 'bg-rose-100 text-rose-900';
  }

  return item.publishedSlug === null
    ? 'bg-amber-100 text-amber-900'
    : 'bg-emerald-100 text-emerald-900';
}
