import type { Routes } from '@angular/router';

import { IndiceComponent } from './indice/indice.component';
import { StatusComponent } from './status/status.component';
import { TILE_LOADERS, TILES, isTileBuilt } from './tiles';

/**
 * Mapa vigente del wiki (contrato del registro, tile M0).
 *
 * `/` es el índice del registro y `/estado` conserva el humo del arranque. Las rutas de tile se
 * derivan de `tiles.ts`, que es la fuente única del mapa: declarar un tile ahí y registrar su
 * cargador es todo lo que hace falta para publicarlo, así que el índice y el router no pueden
 * discrepar.
 *
 * `/foto-a-ficha` ya no existe: sus claims viven en A2 y A4 y su componente se retiró cuando ambos
 * los publicaron.
 */
function builtTileRoutes(): Routes {
  return TILES.flatMap((tile) => {
    const loadComponent = TILE_LOADERS[tile.code];
    return loadComponent === undefined || !isTileBuilt(tile)
      ? []
      : [{ path: tile.route, loadComponent }];
  });
}

export const routes: Routes = [
  { path: '', component: IndiceComponent },
  { path: 'estado', component: StatusComponent },
  ...builtTileRoutes(),
  { path: '**', redirectTo: '' },
];
