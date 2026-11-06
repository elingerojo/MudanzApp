import type { Routes } from '@angular/router';

import { requireEventAdmin } from './events/dashboard/dashboard.guard';
import { HomeComponent } from './home/home.component';
import { RedeemComponent } from './session/redeem.component';
import { requireSession } from './session/session.guard';

/**
 * Mapa de rutas del corte D8 (`plan-ciclo-d8-shell-nav` §5).
 *
 * La superficie privada tiene tres destinos de nivel raíz —`/captura`, `/capturados` y `/cuenta`— y
 * dos pantallas de detalle fuera de la barra —`/articulos/:itemId` y `/dashboard`—. El evento ya no
 * está en la URL: se resuelve de la sesión, igual que el evento activo de `SessionStore`.
 *
 * Las rutas `/eventos/:eventId...` se conservan como **alias que redirigen** para no romper enlaces
 * internos ya escritos. No validan que el `:eventId` de la URL sea el evento de la sesión: la
 * pantalla usa el evento activo, y una cuenta con más de un evento espera el selector de D2.
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
    path: 'captura',
    loadComponent: () =>
      import('./events/capture.component').then((module) => module.CaptureComponent),
    canActivate: [requireSession],
  },
  {
    path: 'capturados',
    loadComponent: () =>
      import('./items/item-list.component').then((module) => module.ItemListComponent),
    canActivate: [requireSession],
  },
  {
    path: 'articulos/:itemId',
    loadComponent: () =>
      import('./items/item-edit.component').then((module) => module.ItemEditComponent),
    canActivate: [requireSession],
  },
  {
    path: 'cuenta',
    loadComponent: () =>
      import('./session/cuenta.component').then((module) => module.CuentaComponent),
    canActivate: [requireSession],
  },
  // El dashboard del event-administrator (ciclo 4c-2, decisión §37). Deja de ser pestaña, pero sigue
  // siendo una ruta propia con su guarda: el derecho se pregunta al borde, no se deduce de la sesión.
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./events/dashboard/dashboard.component').then((module) => module.DashboardComponent),
    canActivate: [requireEventAdmin],
  },
  // Administración de plataforma (ciclo E1, decisión §46). No lleva guarda de sesión: la puerta es
  // `ADMIN_TOKEN`, que se escribe en la pantalla y vive solo en la memoria de esa pestaña.
  {
    path: 'admin/plataforma',
    loadComponent: () =>
      import('./platform-admin/platform-admin.component').then(
        (module) => module.PlatformAdminComponent,
      ),
  },
  // Alias de compatibilidad del corte D8. El orden importa: las hijas se declaran antes que el padre.
  { path: 'eventos/:eventId/articulos/:itemId', redirectTo: '/articulos/:itemId' },
  { path: 'eventos/:eventId/capturados', redirectTo: '/capturados' },
  { path: 'eventos/:eventId/dashboard', redirectTo: '/dashboard' },
  { path: 'eventos/:eventId', redirectTo: '/captura' },
  { path: '**', redirectTo: '' },
];
