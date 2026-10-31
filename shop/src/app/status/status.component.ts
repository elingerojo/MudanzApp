import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { Health } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';

/**
 * Humo de estado: consume `/health` del backend y lo renderiza.
 *
 * Es el walking skeleton de la superficie pública: prueba que el Worker sirve la shell y que el
 * backend responde cross-origin, sin declarar ninguna capacidad de catálogo. Lo sustituye la
 * primera página publicada (`publish`, ciclo 3c).
 *
 * El tipo viene de `shared`, así que la forma del payload no se duplica aquí. Los estados se
 * exponen como signals derivados para que la plantilla no navegue tipos anidados.
 */
@Component({
  selector: 'app-status',
  templateUrl: './status.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusComponent {
  private readonly apiBaseUrl = inject(API_BASE_URL);

  protected readonly health = httpResource<Health>(() => `${this.apiBaseUrl}/health`);

  protected readonly processState = computed(() => this.health.value()?.status ?? 'unreachable');
  protected readonly databaseState = computed(() => this.health.value()?.database ?? 'unknown');
}
