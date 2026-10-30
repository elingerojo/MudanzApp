import {
  ANCHO_TEXTO_PEOR_EM,
  ASCENTE_TINTA_EM,
  CENTRO_TINTA_EM,
  DESCENTE_TINTA_EM,
  OVERHANG,
  TIPOGRAFIA_CARGA,
  VEHICULO_POR_ID,
  VEHICULOS,
  candidatosPara,
  curvaPercepcion,
  llenado,
  nivelVisual,
  porcentajeReal,
  presentacionPara,
  ventanaPara,
} from './vehiculos-carga';

describe('vehiculos-carga', () => {
  const casos: readonly (readonly [number, readonly string[]])[] = [
    [0, ['v4', 'v3']],
    [2, ['v4', 'v3']],
    [2.01, ['v3', 'v2']],
    [8, ['v3', 'v2']],
    [8.01, ['v2', 'v1']],
    [18, ['v2', 'v1']],
    [18.01, ['v1']],
    [40, ['v1']],
    [45, ['v1']],
  ];

  for (const [carga, ids] of casos) {
    it(`deriva los candidatos en ${carga} m3`, () => {
      expect(candidatosPara(carga).map((vehiculo) => vehiculo.id)).toEqual(ids);
    });
  }

  it('recorta el llenado entre 0 y 1', () => {
    expect(llenado(0, 2)).toBe(0);
    expect(llenado(2, 2)).toBe(1);
    expect(llenado(3, 2)).toBe(1);
    expect(llenado(-1, 2)).toBe(0);
  });

  it('publica el porcentaje real, no el deformado', () => {
    expect(porcentajeReal(12, 12)).toBe(100);
    expect(porcentajeReal(12, 18)).toBe(67);
    expect(porcentajeReal(45, 40)).toBe(100);
  });

  it('amplifica los extremos con la inversa del ease coseno', () => {
    expect(curvaPercepcion(0)).toBe(0);
    expect(curvaPercepcion(0.5)).toBeCloseTo(0.5, 10);
    expect(curvaPercepcion(1)).toBeCloseTo(1, 10);
    expect(curvaPercepcion(0.01)).toBeCloseTo(0.0498, 3);
    expect(curvaPercepcion(0.05)).toBeCloseTo(0.1192, 3);
    expect(curvaPercepcion(0.99)).toBeCloseTo(0.9502, 3);
  });

  it('deja el nivel fuera de la caja en los extremos', () => {
    const v1 = VEHICULO_POR_ID.v1;
    const sobreAncho = OVERHANG * v1.caja.ancho;

    expect(nivelVisual(v1, 0)).toBeCloseTo(v1.caja.x - sobreAncho, 5);
    expect(nivelVisual(v1, v1.capacidadM3)).toBeCloseTo(v1.caja.x + v1.caja.ancho + sobreAncho, 5);
  });

  it('mapea cada par a su ventana con margen de recorte', () => {
    expect(ventanaPara(['v4', 'v3'])).toMatchObject({ x: 16, span: 350 });
    expect(ventanaPara(['v3', 'v2'])).toMatchObject({ x: 151, span: 458 });
    expect(ventanaPara(['v2', 'v1'])).toMatchObject({ x: 378, span: 628 });
    expect(ventanaPara(['v1'])).toMatchObject({ x: 609, span: 397 });
  });

  it('falla ruidosamente con un par desconocido', () => {
    expect(() => ventanaPara(['v1', 'v2'] as const)).toThrow('Ventana desconocida');
  });

  describe('tipografia del porcentaje', () => {
    /** Aire de diseno entre la tinta y el borde negro de la caja, en unidades del viewBox. */
    const PADDING = 1;

    /** Avance de `83%`, medido con la misma fuente: el caso normal de dos digitos. */
    const ANCHO_DOS_DIGITOS_EM = 1.74;

    it('reduce el tamano en el caso especial de 100 %', () => {
      expect(presentacionPara(VEHICULO_POR_ID.v3, 99).tamano).toBe(48);
      expect(presentacionPara(VEHICULO_POR_ID.v3, 100).tamano).toBe(40);
    });

    it('mantiene el porcentaje de dos digitos dentro de la caja', () => {
      for (const vehiculo of VEHICULOS) {
        const estilo = TIPOGRAFIA_CARGA.porVehiculo[vehiculo.id];

        if (estilo.modo !== 'dentro') {
          continue;
        }

        expect(estilo.tamano * ANCHO_DOS_DIGITOS_EM).toBeLessThanOrEqual(
          vehiculo.caja.ancho - 2 * PADDING,
        );
      }
    });

    it('mantiene el 100 % dentro de la caja con su tamano reducido', () => {
      for (const vehiculo of VEHICULOS) {
        const estilo = TIPOGRAFIA_CARGA.porVehiculo[vehiculo.id];

        if (estilo.modo !== 'dentro') {
          continue;
        }

        expect(estilo.tamano100 * ANCHO_TEXTO_PEOR_EM).toBeLessThanOrEqual(
          vehiculo.caja.ancho - 2 * PADDING,
        );
      }
    });

    it('centra el modo dentro en la caja y le suma el ajuste del vehiculo', () => {
      const v3 = VEHICULO_POR_ID.v3;
      const presentacion = presentacionPara(v3, 50);

      expect(presentacion.modo).toBe('dentro');
      expect(presentacion.x).toBeCloseTo(v3.caja.x + v3.caja.ancho / 2, 5);
      expect(presentacion.y).toBeCloseTo(
        v3.caja.y + v3.caja.alto / 2 + CENTRO_TINTA_EM * presentacion.tamano - 2,
        5,
      );
    });

    it('centra la etiqueta en el vehiculo y la separa del techo', () => {
      const v4 = VEHICULO_POR_ID.v4;
      const presentacion = presentacionPara(v4, 50);
      const tintaAbajo = presentacion.y + DESCENTE_TINTA_EM * presentacion.tamano;
      const tintaArriba = presentacion.y - ASCENTE_TINTA_EM * presentacion.tamano;

      expect(presentacion.modo).toBe('fuera');
      expect(presentacion.x).toBeCloseTo(v4.bbox.x + v4.bbox.ancho / 2, 5);
      expect(v4.bbox.y - tintaAbajo).toBeCloseTo(TIPOGRAFIA_CARGA.separacionTecho, 5);
      expect(tintaArriba).toBeLessThan(v4.bbox.y);
    });

    it('deja la etiqueta de la camioneta dentro de la ventana del par chico', () => {
      const presentacion = presentacionPara(VEHICULO_POR_ID.v4, 50);
      const ancho = ANCHO_TEXTO_PEOR_EM * presentacion.tamano;
      const ventana = ventanaPara(['v4', 'v3']);

      expect(presentacion.x - ancho / 2).toBeGreaterThan(ventana.x);
    });
  });
});
