/**
 * Acceso tipado a la marca pública.
 *
 * `brand.json` es la **única** fuente del nombre público (`⟨APP_NAME⟩`): título, metadatos,
 * manifest y copy se consumen desde aquí y nunca se cablean en el código. El nombre interno
 * (`mudanzapp`) no depende de este archivo: si la marca cambia, el interno no se renombra.
 *
 * Los valores se fijan al construir el archivo; hoy solo existe el hecho confirmado en la
 * plantilla §0 (el nombre público). Las superficies que aún no tienen hecho declarado se añaden
 * con su ciclo, no por anticipado.
 */
import rawBrand from './brand.json' with { type: 'json' };

/** Forma tipada de la marca pública. */
export interface Brand {
  readonly publicName: string;
}

export const brand: Brand = rawBrand;
