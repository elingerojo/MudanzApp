import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TileHeader } from '../../ui/tile-header/tile-header';

/**
 * Tile E1: entorno, prohibiciones y dependencias.
 *
 * Declara las reglas que no se negocian en el monorepo, cómo se lee el entorno y qué dependencias
 * están aprobadas. No describe la entrega —comandos, matriz de bases y despliegue—: eso es E3, y no
 * repite contratos de datos ni de integración, que viven en A4.
 */
@Component({
  selector: 'app-e1-entorno',
  imports: [TileHeader, RouterLink],
  templateUrl: './e1-entorno.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class E1EntornoComponent {
  protected readonly areas = [
    'package.json',
    'tsconfig.base.json',
    'backend/package.json',
    'backend/.env.example',
    '.roo/rules/00-stack.md',
    '.plans/stack-tecnologico-app-mudanzapp.md §12',
    '.scripts/ciclo-*.mjs',
    'plans/workflow-ciclos.md',
    'plans/inbox.md',
  ];

  protected readonly decisions = ['§13', '§21', '§26', '§34', '§45'];
}
