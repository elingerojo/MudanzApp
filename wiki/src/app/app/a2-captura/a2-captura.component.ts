import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AI_DRAFT_LIMITS, CAPTURE_LIMITS } from '@mudanzapp/shared';

import { TileHeader } from '../../ui/tile-header/tile-header';

/**
 * Tile A2: cuenta y captura — el recorrido del co-dispositivo y de la cuenta.
 *
 * Absorbe los claims de la página heredada `/foto-a-ficha` (sección 3 del dossier): su contrato de la
 * IA se publica aquí, derivado de `shared`, y el detalle de esquema y códigos queda en A4.
 */
@Component({
  selector: 'app-a2-captura',
  imports: [TileHeader, RouterLink],
  templateUrl: './a2-captura.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class A2CapturaComponent {
  protected readonly titleLimit = AI_DRAFT_LIMITS.title;
  protected readonly noteLimit = AI_DRAFT_LIMITS.note;
  protected readonly photosPerItem = CAPTURE_LIMITS.photos;
  protected readonly ticketMinutes = CAPTURE_LIMITS.ttlSeconds / 60;

  protected readonly areas = [
    'frontend/src/app/events/',
    'frontend/src/app/session/',
    'backend/src/routes/events-router.ts',
    'backend/src/routes/ai-router.ts',
    'backend/src/routes/items-router.ts',
    'backend/src/routes/captures-router.ts',
    'shared/src/ai.ts',
    'shared/src/capture.ts',
  ];

  protected readonly decisions = ['§30', '§34', '§45'];
}
