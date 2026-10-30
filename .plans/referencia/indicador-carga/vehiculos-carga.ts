export type VehiculoId = 'v4' | 'v3' | 'v2' | 'v1';

export interface VehiculoCarga {
  readonly id: VehiculoId;
  readonly nombre: string;
  readonly capacidadM3: number;
  readonly caja: {
    readonly x: number;
    readonly y: number;
    readonly ancho: number;
    readonly alto: number;
  };
  /** bbox del vehiculo completo: la etiqueta flotante se centra en el y se apoya en su techo. */
  readonly bbox: {
    readonly x: number;
    readonly y: number;
    readonly ancho: number;
  };
}

export interface VentanaCarga {
  readonly ids: readonly VehiculoId[];
  readonly x: number;
  readonly span: number;
}

/**
 * Capacidades placeholder del sandbox.
 *
 * Son inventadas y se derivan del area de la silueta de la caja con un factor de 1.8 m3 por
 * 1 000 unidades cuadradas, redondeado, salvo `v3`, que el dueno fijo en 8 m3. Migrar a
 * configuracion o a un `InjectionToken` cuando el indicador deje de ser una prueba de concepto.
 * Ver `plans/indicador-carga-tentativo.md` §2.
 *
 * `bbox` sale del `data-bbox` de cada grupo del SVG y de §3 de la leyenda.
 */
export const VEHICULOS = [
  {
    id: 'v4',
    nombre: 'camioneta',
    capacidadM3: 2,
    caja: { x: 36, y: 551, ancho: 36, alto: 30 },
    bbox: { x: 22, y: 529, ancho: 119 },
  },
  {
    id: 'v3',
    nombre: 'camión pequeño',
    capacidadM3: 8,
    caja: { x: 172, y: 510, ancho: 99, alto: 66 },
    bbox: { x: 157, y: 496, ancho: 203 },
  },
  {
    id: 'v2',
    nombre: 'camión mediano',
    capacidadM3: 18,
    caja: { x: 397, y: 480, ancho: 117, alto: 88 },
    bbox: { x: 384, y: 468, ancho: 219 },
  },
  {
    id: 'v1',
    nombre: 'camión grande',
    capacidadM3: 40,
    caja: { x: 628, y: 463, ancho: 264, alto: 86 },
    bbox: { x: 615, y: 448, ancho: 385 },
  },
] as const satisfies readonly VehiculoCarga[];

export const VEHICULO_POR_ID = {
  v4: VEHICULOS[0],
  v3: VEHICULOS[1],
  v2: VEHICULOS[2],
  v1: VEHICULOS[3],
} as const satisfies Record<VehiculoId, VehiculoCarga>;

/**
 * Ventanas de la tira, en unidades del `viewBox` completo (1024 x 1024).
 *
 * La ventana del par activo no reescala: solo recorta. `x` y `span` son los bbox exactos del par;
 * `ventanaPara` les añade el margen de recorte. Ver `plans/indicador-carga-tentativo.md` §4.
 */
export const VENTANAS = [
  { ids: ['v4', 'v3'], x: 22, span: 338 },
  { ids: ['v3', 'v2'], x: 157, span: 446 },
  { ids: ['v2', 'v1'], x: 384, span: 616 },
  { ids: ['v1'], x: 615, span: 385 },
] as const satisfies readonly VentanaCarga[];

/**
 * Margen de la ventana, en unidades del viewBox, para que el trazo del borde no se corte en el
 * marco. El margen no cambia la derivacion del par: solo el recorte.
 */
export const MARGEN_VENTANA = 6;

const VENTANA_POR_CLAVE = new Map<string, VentanaCarga>(
  VENTANAS.map((ventana) => [ventana.ids.join('+'), ventana] as const),
);

export const CURVA_K = 0.74;
export const OVERHANG = 0.03;
export const VIEWBOX_ANCHO = 1024;
export const VIEWBOX_ALTO = 180;
export const VIEWBOX_Y = 444;

export function clamp01(valor: number): number {
  if (!Number.isFinite(valor)) {
    return 0;
  }

  return Math.min(1, Math.max(0, valor));
}

export function llenado(cargaM3: number, capacidadM3: number): number {
  return clamp01(cargaM3 / capacidadM3);
}

/**
 * Inversa del ease coseno: amplifica los extremos.
 *
 * `arco(0)=0`, `arco(0.5)=0.5` y `arco(1)=1`, con tangente vertical en los extremos. Con `k=0.74`
 * un 1 % real se lee como 5 % visual y un 99 % como 95 %. La deformacion es solo visual: el
 * porcentaje real sigue saliendo de `porcentajeReal`.
 */
export function curvaPercepcion(t: number, k: number = CURVA_K): number {
  const acotado = clamp01(t);
  const arco = Math.acos(1 - 2 * acotado) / Math.PI;

  return (1 - k) * acotado + k * arco;
}

export function porcentajeReal(cargaM3: number, capacidadM3: number): number {
  return Math.round(llenado(cargaM3, capacidadM3) * 100);
}

/**
 * Borde derecho del relleno rojo, en unidades del `viewBox`.
 *
 * La deformacion es solo visual: `porcentajeReal` sigue publicando el valor real para ARIA.
 */
export function nivelVisual(vehiculo: VehiculoCarga, cargaM3: number): number {
  const t = llenado(cargaM3, vehiculo.capacidadM3);
  const p = curvaPercepcion(t);
  const { x, ancho } = vehiculo.caja;

  return x - OVERHANG * ancho + p * ancho * (1 + 2 * OVERHANG);
}

/**
 * Desplazamiento del rect rojo de 1024 de ancho para que su borde derecho quede en `nivelVisual`.
 */
export function desplazamientoNivel(vehiculo: VehiculoCarga, cargaM3: number): number {
  return nivelVisual(vehiculo, cargaM3) - VIEWBOX_ANCHO;
}

export function candidatosPara(cargaM3: number): readonly VehiculoCarga[] {
  const caben = VEHICULOS.filter((vehiculo) => vehiculo.capacidadM3 >= cargaM3);

  if (caben.length === 0) {
    return [VEHICULOS[3]];
  }

  return caben.slice(0, 2);
}

export function ventanaPara(ids: readonly VehiculoId[]): VentanaCarga {
  const ventana = VENTANA_POR_CLAVE.get(ids.join('+'));

  if (!ventana) {
    throw new Error(`Ventana desconocida: ${ids.join('+')}`);
  }

  return {
    ids: ventana.ids,
    x: ventana.x - MARGEN_VENTANA,
    span: ventana.span + 2 * MARGEN_VENTANA,
  };
}

/* TIPOGRAFIA DEL PORCENTAJE ===================================================
   Todo en unidades del `viewBox`, no en pixeles. El SVG se dimensiona por alto, asi que una unidad
   mide 1.56 px con la ventana a 280 px y 0.43 px en un viewport de 320. Expresar los tamanos en
   pixeles obligaria a leer la escala en runtime y a perder la independencia de resolucion.
   =============================================================================== */

/**
 * Metricas de tinta de Permanent Marker, en fraccion de `em`, medidas con
 * `CanvasRenderingContext2D.measureText` y sus `actualBoundingBox*`.
 *
 * `getBBox()` de un `<text>` no sirve para esto: devuelve la caja de linea del font (1.44 em aqui) y
 * no el glifo pintado, y con esa medida todos los tamanos quedaban a la mitad.
 */
export const ASCENTE_TINTA_EM = 0.77;
export const DESCENTE_TINTA_EM = 0.03;

/** Distancia de la linea base al centro vertical de la tinta, para centrar dentro de la caja. */
export const CENTRO_TINTA_EM = (ASCENTE_TINTA_EM - DESCENTE_TINTA_EM) / 2;

/** Avance del peor texto, `100%`, medido a 100 px. Es el limite del caso especial de 100 %. */
export const ANCHO_TEXTO_PEOR_EM = 2.34;

export type ModoTipografia = 'dentro' | 'fuera';

export interface EstiloVehiculo {
  readonly modo: ModoTipografia;
  /** Tamano de 0 % a 99 %: dos digitos y el signo. */
  readonly tamano: number;
  /** Tamano del 100 %: tres digitos y el signo, el texto mas ancho. */
  readonly tamano100: number;
  /** Ajuste fino vertical del ancla, en unidades del viewBox. Negativo sube. */
  readonly desplazamientoY: number;
}

export interface TipografiaCarga {
  readonly familia: string;
  /** Aire entre el techo del vehiculo y la tinta de la etiqueta flotante. */
  readonly separacionTecho: number;
  readonly porVehiculo: Record<VehiculoId, EstiloVehiculo>;
}

/**
 * Tipografia del porcentaje, fija para los cuatro vehiculos.
 *
 * El 100 % es un caso especial: es el unico texto de tres digitos y con el tamano normal desborda la
 * caja, asi que cada camion declara un `tamano100` que cabe. `v1` no necesita recorte y repite su
 * tamano. Los valores salen de las metricas medidas y del aire de 1 unidad por lado; la derivacion
 * completa vive en `plans/indicador-carga-tentativo.md` §12.
 *
 * `desplazamientoY` corrige el ancla por vehiculo: `v3` sube 2 unidades para alejarse del trazo de
 * la llanta. `v4` usa la etiqueta flotante y su altura se deriva de `separacionTecho`.
 */
export const TIPOGRAFIA_CARGA: TipografiaCarga = {
  familia: 'Permanent Marker',
  separacionTecho: 2,
  porVehiculo: {
    v1: { modo: 'dentro', tamano: 64, tamano100: 64, desplazamientoY: 0 },
    v2: { modo: 'dentro', tamano: 52, tamano100: 48, desplazamientoY: 0 },
    v3: { modo: 'dentro', tamano: 48, tamano100: 40, desplazamientoY: -2 },
    v4: { modo: 'fuera', tamano: 40, tamano100: 40, desplazamientoY: 0 },
  },
};

export interface PresentacionCarga {
  readonly modo: ModoTipografia;
  readonly tamano: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Resuelve modo, tamano y ancla del porcentaje de un vehiculo.
 *
 * El ancla es una linea base explicita, no `dominant-baseline`, para no depender de la
 * implementacion del navegador:
 *
 * - **Dentro**: centro de la caja, con la tinta centrada por `CENTRO_TINTA_EM`.
 * - **Fuera**: centro del vehiculo completo, con la tinta a `separacionTecho` unidades sobre su
 *   techo. Se mide desde el techo del vehiculo y no desde la caja porque la etiqueta flota sobre el
 *   dibujo entero, y asi la separacion sobrevive a un cambio de tamano.
 *
 * `desplazamientoY` se suma al final: es el ajuste fino de cada vehiculo.
 */
export function presentacionPara(vehiculo: VehiculoCarga, porcentaje: number): PresentacionCarga {
  const estilo = TIPOGRAFIA_CARGA.porVehiculo[vehiculo.id];
  const tamano = porcentaje >= 100 ? estilo.tamano100 : estilo.tamano;
  const { caja, bbox } = vehiculo;

  const x = estilo.modo === 'dentro' ? caja.x + caja.ancho / 2 : bbox.x + bbox.ancho / 2;
  const yBase =
    estilo.modo === 'dentro'
      ? caja.y + caja.alto / 2 + CENTRO_TINTA_EM * tamano
      : bbox.y - TIPOGRAFIA_CARGA.separacionTecho - DESCENTE_TINTA_EM * tamano;

  return {
    modo: estilo.modo,
    tamano,
    x,
    y: yBase + estilo.desplazamientoY,
  };
}
