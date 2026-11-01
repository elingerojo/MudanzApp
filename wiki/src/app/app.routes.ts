import type { Routes } from '@angular/router';

import { StatusComponent } from './status/status.component';

export const routes: Routes = [
  { path: '', component: StatusComponent },
  // Sección 3 del dossier (ciclo 3d). Carga perezosa y antes del comodín: la página no necesita
  // sesión ni backend, y el arnés la abre sin URL absoluta.
  {
    path: 'foto-a-ficha',
    loadComponent: () =>
      import('./foto-a-ficha/foto-a-ficha.component').then((module) => module.FotoAFichaComponent),
  },
  { path: '**', redirectTo: '' },
];
