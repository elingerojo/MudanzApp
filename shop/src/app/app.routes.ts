import type { Routes } from '@angular/router';

import { StatusComponent } from './status/status.component';

/**
 * Mapa vigente de `shop`: `/` sigue siendo el humo del arranque, `/evento/:publicSlug` es el índice
 * público del evento, `/:slug` la ficha pública y, desde el ciclo 4d, `/cuenta` es la cuenta del
 * visitante con su vuelta pública `/auth/callback`.
 *
 * `cuenta` va **antes** de `:slug`: es una ruta de un segmento y, sin el orden explícito, la ficha la
 * capturaría como un `slug`. El Worker conserva la misma exclusión en `RESERVED_PATHS`.
 */
export const routes: Routes = [
  { path: '', component: StatusComponent },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./session/shop-oauth-callback.component').then((m) => m.ShopOAuthCallbackComponent),
  },
  {
    path: 'cuenta',
    loadComponent: () =>
      import('./account/shop-account.component').then((m) => m.ShopAccountComponent),
  },
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
