import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TileHeader } from '../../ui/tile-header/tile-header';

/**
 * Tile E3: entrega y verificación.
 *
 * Publica cómo se comprueba y cómo se publica: el gate por tipo de corte, el contrato de scripts, la
 * matriz de bases con sus derivaciones, el arnés e2e, el humo del backend y el contrato de despliegue.
 * No repite tablas ni códigos de error —eso es A4— ni los pasos de consola que dependen de la máquina,
 * que viven en el manual local no versionado.
 */
@Component({
  selector: 'app-e3-entrega',
  imports: [TileHeader, RouterLink],
  templateUrl: './e3-entrega.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class E3EntregaComponent {
  protected readonly areas = [
    'README.md §6–§14',
    '.roo/rules/04-verificacion.md',
    '.roo/rules/06-datos.md',
    'e2e/playwright.config.ts',
    'e2e/support/harness.ts',
    'backend/scripts/migrate.ts',
    '.scripts/ciclo-*.mjs',
  ];

  protected readonly decisions = ['§16', '§17', '§18', '§19'];
}
