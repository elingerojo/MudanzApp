import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AI_DRAFT_LIMITS } from '@mudanzapp/shared';

/**
 * Sección 3 del dossier: «Foto a ficha: contrato de la IA y revisión humana» (ciclo 3d).
 *
 * Página estática y sin sesión: explica el hecho que el ciclo ya construyó, no lo anticipa. Los
 * límites se **importan** de `shared/src/ai.ts`, así que la página no tiene una segunda copia del
 * contrato y no puede quedarse desfasada sin que falle el build.
 */
@Component({
  selector: 'app-foto-a-ficha',
  templateUrl: './foto-a-ficha.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FotoAFichaComponent {
  protected readonly titleLimit = AI_DRAFT_LIMITS.title;
  protected readonly noteLimit = AI_DRAFT_LIMITS.note;
}
