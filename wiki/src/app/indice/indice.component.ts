import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { isTileBuilt, TILES, type Tile } from '../tiles';

interface BlockView {
  readonly label: string;
  readonly note: string;
  readonly tiles: readonly Tile[];
}

/**
 * Índice del registro (`/`).
 *
 * Reemplaza el humo del arranque, que se trasladó a `/estado` (tile M0). Los diez tiles del mapa se
 * listan siempre; solo los que ya tienen página se enlazan, para que un enlace no termine en el
 * comodín y devuelva al lector al mismo sitio.
 */
@Component({
  selector: 'app-indice',
  imports: [RouterLink],
  templateUrl: './indice.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndiceComponent {
  protected readonly blocks: readonly BlockView[] = [
    {
      label: 'Ingeniería',
      note: 'Cómo se construye, se limita y se verifica el proyecto.',
      tiles: TILES.filter((tile) => tile.block === 'ingenieria'),
    },
    {
      label: 'Aplicación',
      note: 'Qué hace el producto, para quién y con qué contratos.',
      tiles: TILES.filter((tile) => tile.block === 'app'),
    },
  ];

  protected readonly isBuilt = isTileBuilt;
}
