import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type UiButtonVariant = 'primary' | 'secondary' | 'danger';

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60';

const VARIANT_CLASSES: Record<UiButtonVariant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800',
  secondary: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-100',
  danger: 'text-red-600 hover:bg-red-50',
};

/**
 * Clases de una variante, exportadas para que un control que **no puede** ser `<button>` vista el
 * mismo estilo sin repetir los tokens. El caso concreto del ciclo 3a: la foto se elige con un
 * `<label for>` sobre el input de archivo, porque solo un label lo activa de forma nativa y un
 * `<button>` estilizado no abre la cámara en el móvil.
 */
export function uiButtonClasses(variant: UiButtonVariant = 'primary'): string {
  return `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} cursor-pointer`;
}

/**
 * Primitiva de acción: un botón, tres variantes. Cuando recibe `link` renderiza un ancla con
 * `routerLink`, porque navegar es de un enlace y conserva clic derecho y clic central. Solo
 * presentación: no inyecta servicios ni posee estado.
 *
 * `testId` escribe `data-testid` en el control real, no en el host, para que el gancho de la prueba
 * conserve `disabled`, el clic y el rol accesible.
 */
@Component({
  selector: 'app-ui-button',
  imports: [RouterLink],
  templateUrl: './ui-button.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
})
export class UiButtonComponent {
  readonly variant = input<UiButtonVariant>('primary');

  readonly type = input<'button' | 'submit'>('button');

  readonly disabled = input(false);

  /** Cuando se indica, renderiza un ancla con esta ruta interna. */
  readonly link = input<string | null>(null);

  readonly testId = input<string | null>(null);

  protected readonly classes = computed(() => uiButtonClasses(this.variant()));
}
