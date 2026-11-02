/**
 * Hash determinista de las claves de versión de los snapshots públicos.
 *
 * Se implementa aquí y no se importa una biblioteca porque la clave debe salir **igual** en el
 * backend, en el Worker y en las pruebas, sin depender de `Intl` ni de la plataforma. Es la misma
 * función que el índice del evento usó desde el ciclo 4a; desde 4b también compone la versión de la
 * ficha del artículo.
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * FNV-1a de 64 bits sobre las unidades UTF-16 del texto.
 *
 * 16 hex son de sobra para distinguir dos versiones de la misma página. Un hash no es una firma:
 * solo decide si la copia guardada sigue representando lo que la página pinta.
 */
export function fnv1a64(text: string): string {
  let value = FNV_OFFSET;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    value ^= BigInt(code & 0xff);
    value = (value * FNV_PRIME) & MASK_64;
    value ^= BigInt(code >> 8);
    value = (value * FNV_PRIME) & MASK_64;
  }

  return value.toString(16).padStart(16, '0');
}
