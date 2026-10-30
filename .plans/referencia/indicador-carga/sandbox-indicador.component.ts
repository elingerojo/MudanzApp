import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  signal,
  viewChild,
} from '@angular/core';

import { IndicadorCargaComponent } from './indicador-carga.component';
import { candidatosPara, porcentajeReal } from './vehiculos-carga';

@Component({
  selector: 'app-sandbox-indicador',
  imports: [IndicadorCargaComponent],
  templateUrl: './sandbox-indicador.component.html',
  styleUrl: './sandbox-indicador.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SandboxIndicadorComponent {
  protected readonly total = signal(0);
  protected readonly borrador = signal('');

  /** Fase 1 del reset: la tira se pinta sin transiciones. */
  protected readonly sinTransicion = signal(false);

  private readonly volumenInput = viewChild<ElementRef<HTMLInputElement>>('volumen');

  protected readonly puedeAgregar = computed(() => {
    const valor = this.valorBorrador();

    return valor !== null && valor !== 0;
  });

  protected readonly esResta = computed(() => (this.valorBorrador() ?? 0) < 0);

  protected readonly etiquetaAccion = computed(() => (this.esResta() ? 'Restar' : 'Agregar'));

  protected readonly totalTexto = computed(() => `${this.formatear(this.total())} m³`);

  protected readonly detalle = computed(() =>
    candidatosPara(this.total()).map((vehiculo) => ({
      nombre: vehiculo.nombre,
      capacidadM3: vehiculo.capacidadM3,
      porcentaje: porcentajeReal(this.total(), vehiculo.capacidadM3),
    })),
  );

  protected actualizarBorrador(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.borrador.set(input.value);
  }

  protected reiniciarCarga(): void {
    this.sinTransicion.set(true);
    this.total.set(0);

    this.enSiguientePintado(() => this.sinTransicion.set(false));
  }

  protected agregar(event: Event): void {
    event.preventDefault();

    const valor = this.valorBorrador();
    if (valor === null || valor === 0) {
      return;
    }

    if (valor < 0) {
      this.resetearYAvanzar(valor);
    } else {
      this.total.update((total) => total + valor);
    }

    this.borrador.set('');
    this.volumenInput()?.nativeElement.focus();
  }

  /**
   * Entrada negativa: fase 1 pinta el estado fresco sin transicion, fase 2 anima hasta el destino.
   *
   * Los dos `requestAnimationFrame` anidados no son adorno. Los callbacks de rAF corren antes del
   * pintado del frame, asi que un solo rAF escribiria las dos fases en el mismo recalculo de estilo
   * y el salto no se veria: la tira animaria desde la posicion vieja. El rAF interno corre en el
   * frame siguiente, cuando la fase 1 ya se pinto.
   */
  private resetearYAvanzar(valor: number): void {
    const destino = Math.max(0, this.total() + valor);

    this.sinTransicion.set(true);
    this.total.set(0);

    this.enSiguientePintado(() => {
      this.sinTransicion.set(false);
      this.total.set(destino);
    });
  }

  private enSiguientePintado(accion: () => void): void {
    requestAnimationFrame(() => requestAnimationFrame(accion));
  }

  private valorBorrador(): number | null {
    const texto = this.borrador().trim();
    if (!texto) {
      return null;
    }

    const valor = Number(texto);

    return Number.isFinite(valor) ? valor : null;
  }

  private formatear(valor: number): string {
    return Number(valor.toFixed(2)).toString();
  }
}
