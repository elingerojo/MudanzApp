import type { Routes } from '@angular/router';

import { requireCaptureSession } from './events/capture-session.guard';
import { requireEventAdmin } from './events/dashboard/dashboard.guard';
import { HomeComponent } from './home/home.component';
import { requireEventChoice } from './session/event-choice.guard';
import { RedeemComponent } from './session/redeem.component';
import { requireSession } from './session/session.guard';

/**
 * Mapa de rutas de los cortes D8, D9, D10, D2 y D13.
 *
 * La superficie privada aterriza en `/inicio`, que presenta el evento y pide la primera foto. Desde
 * D13 `Captura` no es un destino permanente: exige una foto en la sesión de captura y, sin ella,
 * redirige a `/inicio`. Los otros destinos de la barra son `/capturados` y `/cuenta`. Desde D10 la
 * administración del evento es una **ruta hija de la Cuenta** (`/cuenta/evento`) y la única pantalla
 * de detalle fuera de la barra es `/articulos/:itemId`. El evento ya no está en la URL: se resuelve
 * de la sesión, igual que el evento activo de `SessionStore`.
 *
 * Desde D2 una cuenta con dos o más membresías elige su mudanza en `/eventos`: `requireEventChoice`
 * devuelve ahí cualquier destino privado mientras no haya una elección explícita. Con una sola
 * membresía la guarda no interviene y el aterrizaje directo de D8 se conserva.
 *
 * Las rutas `/eventos/:eventId...` se conservan como **alias que redirigen** para no romper enlaces
 * internos ya escritos; `/dashboard` también redirige a su hija de Cuenta. No validan que el
 * `:eventId` de la URL sea el evento de la sesión: la pantalla usa el evento activo.
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
  // Selector de mudanza (corte D2). Con dos o más membresías es el aterrizaje de la cuenta; con una
  // sola no se visita.
  {
    path: 'eventos',
    loadComponent: () =>
      import('./events/event-selector.component').then((module) => module.EventSelectorComponent),
    canActivate: [requireSession],
  },
  // Bienvenida de la sesión privada (corte D13): el aterrizaje después del canje, de la vuelta del
  // proveedor y de elegir mudanza. Presenta el evento y pide la primera foto.
  {
    path: 'inicio',
    loadComponent: () =>
      import('./events/inicio.component').then((module) => module.InicioComponent),
    canActivate: [requireSession, requireEventChoice],
  },
  {
    path: 'captura',
    loadComponent: () =>
      import('./events/capture.component').then((module) => module.CaptureComponent),
    // Desde D13 el panel nunca se abre vacío: sin foto, la guarda devuelve a la bienvenida.
    canActivate: [requireSession, requireEventChoice, requireCaptureSession],
  },
  {
    path: 'capturados',
    loadComponent: () =>
      import('./items/item-list.component').then((module) => module.ItemListComponent),
    canActivate: [requireSession, requireEventChoice],
  },
  {
    path: 'articulos/:itemId',
    loadComponent: () =>
      import('./items/item-edit.component').then((module) => module.ItemEditComponent),
    canActivate: [requireSession, requireEventChoice],
  },
  // Cuenta (cortes D8 y D9) y su hija de administración (corte D10). La ruta padre no tiene
  // componente: `/cuenta` pinta la Cuenta y `/cuenta/evento` pinta el panel en el outlet principal.
  // El derecho se sigue preguntando al borde (decisión §37), no se deduce de la sesión.
  {
    path: 'cuenta',
    canActivate: [requireSession],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./session/cuenta.component').then((module) => module.CuentaComponent),
      },
      {
        path: 'evento',
        loadComponent: () =>
          import('./events/dashboard/dashboard.component').then(
            (module) => module.DashboardComponent,
          ),
        // Con varias mudanzas y sin elección, primero se elige: la administración no adivina.
        canActivate: [requireEventChoice, requireEventAdmin],
      },
    ],
  },
  // Desde D10 la administración vive dentro de la Cuenta; la URL anterior se conserva como
  // redirección para no romper enlaces guardados.
  { path: 'dashboard', redirectTo: '/cuenta/evento' },
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
  { path: 'eventos/:eventId/dashboard', redirectTo: '/cuenta/evento' },
  { path: 'eventos/:eventId', redirectTo: '/inicio' },
  { path: '**', redirectTo: '' },
];
