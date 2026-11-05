import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Botón con progreso real dentro (`plan-ciclo-4g` §5).
 *
 * Tres estados y una regla que no se negocia: **nunca muestra 100 % mientras el trabajo no esté
 * confirmado**. El padre decide cuándo pasa a `done`; este componente sólo pinta lo que recibe y
 * esconde el porcentaje del lector tras cuatro hitos, porque anunciar cada punto convierte la
 * espera en ruido.
 *
 * Es el mismo botón, no un botón que se sustituye: el control conserva su `data-testid`, su
 * `aria-label` y su `disabled`, para que la prueba y el humano sigan hablando de la misma acción.
 */

export type UiProgressState = 'idle' | 'working' | 'done';

/** Cuánto dura el destello de cierre; el contenedor lo espera antes de volver al estado inicial. */
export const PROGRESS_DONE_FLASH_MS = 250;

const BASE_CLASSES =
  'relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-lg px-4 py-2 ' +
  'text-sm font-medium motion-safe:transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const STATE_CLASSES: Record<UiProgressState, string> = {
  idle: 'bg-slate-900 text-white hover:bg-slate-800',
  working: 'bg-[var(--color-brand-soft)] text-[var(--color-ink)]',
  done: 'bg-[var(--color-success)] text-white',
};

/** El porcentaje que se pinta: entre 0 y 99, redondeado. `null` es «todavía no empezó». */
function visiblePercent(progress: number | null): number {
  if (progress === null || Number.isNaN(progress)) {
    return 0;
  }

  return Math.min(99, Math.max(0, Math.round(progress)));
}

/** Hito accesible: sólo cambia en 25, 50, 75 y 99, así el lector anuncia cuatro veces y no cien. */
function milestoneOf(percent: number): number {
  if (percent >= 99) {
    return 99;
  }

  if (percent >= 75) {
    return 75;
  }

  if (percent >= 50) {
    return 50;
  }

  if (percent >= 25) {
    return 25;
  }

  return 0;
}

@Component({
  selector: 'app-ui-progress-button',
  templateUrl: './ui-progress-button.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
})
export class UiProgressButtonComponent {
  /** Nombre de la acción; es también el `aria-label` y no cambia con el porcentaje. */
  readonly label = input.required<string>();

  /** Avance de 0 a 100; el componente lo acota a 99 mientras trabaja. */
  readonly progress = input<number | null>(null);

  readonly state = input<UiProgressState>('idle');

  readonly disabled = input(false);

  readonly type = input<'button' | 'submit'>('button');

  readonly testId = input<string | null>(null);

  protected readonly percent = computed(() => visiblePercent(this.progress()));

  protected readonly working = computed(() => this.state() === 'working');

  protected readonly text = computed(() => {
    if (this.state() === 'done') {
      return 'Listo';
    }

    return this.state() === 'working' ? `${this.percent()}%` : this.label();
  });

  protected readonly milestone = computed(() => (this.working() ? milestoneOf(this.percent()) : 0));

  /** Un botón que trabaja o termina no se vuelve a pulsar; el destello no es un estado accionable. */
  protected readonly isDisabled = computed(() => this.disabled() || this.state() !== 'idle');

  protected readonly classes = computed(() => `${BASE_CLASSES} ${STATE_CLASSES[this.state()]}`);

  /** El relleno gana intensidad con el avance: mismo tono de marca, más opaco al final. */
  protected readonly fillOpacity = computed(() => 0.25 + (this.percent() / 100) * 0.35);
}
