import type { Routes } from '@angular/router';

import { StatusComponent } from './status/status.component';

export const routes: Routes = [
  { path: '', component: StatusComponent },
  { path: '**', redirectTo: '' },
];
