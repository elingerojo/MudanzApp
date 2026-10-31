import type { Routes } from '@angular/router';

import { StatusComponent } from './status/status.component';

/**
 * Mapa vigente del ciclo 3c: `/` sigue siendo el humo del arranque —su sustitución por la primera
 * página de catálogo es del ciclo 4— y `/:slug` es la ficha pública de un artículo publicado.
 */
export const routes: Routes = [
  { path: '', component: StatusComponent },
  {
    path: ':slug',
    loadComponent: () => import('./listing/listing.component').then((m) => m.ListingComponent),
  },
  { path: '**', redirectTo: '' },
];
