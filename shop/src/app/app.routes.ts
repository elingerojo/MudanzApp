import type { Routes } from '@angular/router';

import { StatusComponent } from './status/status.component';

/**
 * Mapa vigente del ciclo 4a: `/` sigue siendo el humo del arranque, `/evento/:publicSlug` es el
 * índice público del evento y `/:slug` la ficha pública de un artículo publicado.
 *
 * El índice va **antes** de `:slug` a propósito: `:slug` solo casa un segmento, así que hoy no
 * colisionan, pero el orden deja escrito que el índice es una ruta de dos segmentos y no un `slug`
 * afortunado.
 */
export const routes: Routes = [
  { path: '', component: StatusComponent },
  {
    path: 'evento/:publicSlug',
    loadComponent: () =>
      import('./event-index/event-index.component').then((m) => m.EventIndexComponent),
  },
  {
    path: ':slug',
    loadComponent: () => import('./listing/listing.component').then((m) => m.ListingComponent),
  },
  { path: '**', redirectTo: '' },
];
