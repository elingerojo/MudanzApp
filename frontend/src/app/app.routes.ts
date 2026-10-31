import type { Routes } from '@angular/router';

import { HomeComponent } from './home/home.component';
import { RedeemComponent } from './session/redeem.component';
import { requireSession } from './session/session.guard';

/**
 * Mapa de rutas del ciclo 3a.
 *
 * Tres clases de pantalla, como el marco del referente: el inicio público (`/`) que sirve incluso sin
 * sesión, el canje público (`/invitacion`, que recibe el token por `?token=`) y la sección del evento,
 * perezosa y con guard. `**` vuelve al inicio.
 */
export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'invitacion', component: RedeemComponent },
  {
    path: 'eventos/:eventId',
    loadComponent: () => import('./events/event.component').then((module) => module.EventComponent),
    canActivate: [requireSession],
  },
  { path: '**', redirectTo: '' },
];
