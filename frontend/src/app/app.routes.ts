import type { Routes } from '@angular/router';

import { requireEventAdmin } from './events/dashboard/dashboard.guard';
import { HomeComponent } from './home/home.component';
import { RedeemComponent } from './session/redeem.component';
import { requireSession } from './session/session.guard';

/**
 * Mapa de rutas del ciclo 3 (`plan-ciclo-3d` §5).
 *
 * Tres clases de pantalla, como el marco del referente: el inicio público (`/`) que sirve incluso sin
 * sesión, el canje público (`/invitacion`, que recibe el token por `?token=`) y la sección del evento,
 * perezosa y con guard. `**` vuelve al inicio.
 *
 * Desde 3d la sección del evento tiene **dos pestañas**, y son **dos rutas hijas**: la pestaña es
 * enlazable, el botón «atrás» del teléfono hace lo obvio y el e2e puede abrir cada una sin simular
 * toques. `''` es la captura, que es la que abre por defecto.
 */
export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'invitacion', component: RedeemComponent },
  // Vuelta del proveedor de identidad (ciclo 4c-1). Es pública porque llega un navegador recién
  // redirigido: el reclamo usa la sesión que ya sostiene el dispositivo, no una ruta protegida.
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./session/oauth-callback.component').then((module) => module.OAuthCallbackComponent),
  },
  {
    path: 'eventos/:eventId',
    loadComponent: () => import('./events/event.component').then((module) => module.EventComponent),
    canActivate: [requireSession],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./events/capture.component').then((module) => module.CaptureComponent),
      },
      {
        path: 'capturados',
        loadComponent: () =>
          import('./items/item-list.component').then((module) => module.ItemListComponent),
      },
      {
        path: 'articulos/:itemId',
        loadComponent: () =>
          import('./items/item-edit.component').then((module) => module.ItemEditComponent),
      },
      // El dashboard del event-administrator (ciclo 4c-2, decisión §37). Es una ruta hija del marco,
      // como sus hermanas: la barra global de la aplicación no cambia y el guard pregunta al borde
      // quién administra en vez de deducirlo de la sesión.
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./events/dashboard/dashboard.component').then(
            (module) => module.DashboardComponent,
          ),
        canActivate: [requireEventAdmin],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
