import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  VEHICULO_POR_ID,
  candidatosPara,
  desplazamientoNivel,
  porcentajeReal,
  presentacionPara,
  ventanaPara,
  type VehiculoId,
} from './vehiculos-carga';

@Component({
  selector: 'app-indicador-carga',
  templateUrl: './indicador-carga.component.html',
  styleUrl: './indicador-carga.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Apaga las tres transiciones a la vez mientras el host reproduce el estado fresco de una entrada
  // negativa. Es presentacion pura: no interviene en la derivacion.
  host: {
    '[class.sin-transicion]': 'sinTransicion()',
  },
})
export class IndicadorCargaComponent {
  readonly carga = input.required<number>();

  /** Fase 1 del reset de una entrada negativa: la tira salta al estado inicial sin animar. */
  readonly sinTransicion = input(false);

  protected readonly candidatos = computed(() => candidatosPara(this.carga()));
  protected readonly idsActivos = computed(() => new Set(this.candidatos().map((v) => v.id)));
  protected readonly ventana = computed(() => ventanaPara(this.candidatos().map((v) => v.id)));

  protected readonly niveles = computed(() => ({
    v1: desplazamientoNivel(VEHICULO_POR_ID.v1, this.carga()),
    v2: desplazamientoNivel(VEHICULO_POR_ID.v2, this.carga()),
    v3: desplazamientoNivel(VEHICULO_POR_ID.v3, this.carga()),
    v4: desplazamientoNivel(VEHICULO_POR_ID.v4, this.carga()),
  }));

  protected readonly porcentajes = computed(() => ({
    v1: porcentajeReal(this.carga(), VEHICULO_POR_ID.v1.capacidadM3),
    v2: porcentajeReal(this.carga(), VEHICULO_POR_ID.v2.capacidadM3),
    v3: porcentajeReal(this.carga(), VEHICULO_POR_ID.v3.capacidadM3),
    v4: porcentajeReal(this.carga(), VEHICULO_POR_ID.v4.capacidadM3),
  }));

  /**
   * Modo, tamano efectivo y ancla de cada porcentaje. Se deriva del porcentaje real: el 100 % es el
   * caso especial que usa un tamano menor para no desbordar la caja.
   */
  protected readonly presentaciones = computed(() => {
    const porcentajes = this.porcentajes();

    return {
      v1: presentacionPara(VEHICULO_POR_ID.v1, porcentajes.v1),
      v2: presentacionPara(VEHICULO_POR_ID.v2, porcentajes.v2),
      v3: presentacionPara(VEHICULO_POR_ID.v3, porcentajes.v3),
      v4: presentacionPara(VEHICULO_POR_ID.v4, porcentajes.v4),
    };
  });

  protected esActivo(id: VehiculoId): boolean {
    return this.idsActivos().has(id);
  }

  protected nombre(id: VehiculoId): string {
    return VEHICULO_POR_ID[id].nombre;
  }
}
