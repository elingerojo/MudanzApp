/**
 * Precio del artículo (ciclo 4b, `item-edit`; decisión §35).
 *
 * El precio vive en `app.item.price_cents`, entero en la moneda del evento. La moneda **no** viaja
 * con el precio: se lee de `app.event.currency`. Este módulo compone el texto que la tarjeta, la
 * ficha pública y la pantalla privada muestran, y traduce lo que la persona escribe en el formulario.
 *
 * Sin `Intl`: la ficha se pinta dos veces —snapshot del backend y componente de Angular— y dos
 * runtimes con ICU distinta no pueden producir el mismo texto.
 */

/** Tope del precio, en centavos. Es el mismo número para el formulario y para la frontera. */
export const PRICE_LIMITS = {
  cents: 999_999_999,
} as const;

const CENTS_PER_UNIT = 100;

/** Agrupa miles con comas sin depender de la configuración regional. */
function groupThousands(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Texto del precio: `$1,250.50 MXN`, o `Precio a consultar` cuando es nulo. Un precio nulo no es un
 * cero: es la ausencia del hecho, y la ficha no inventa un número.
 */
export function formatPriceCents(cents: number | null, currency: string): string {
  if (cents === null) {
    return 'Precio a consultar';
  }

  const safe = Math.max(0, Math.trunc(cents));
  const whole = Math.floor(safe / CENTS_PER_UNIT);
  const fraction = String(safe % CENTS_PER_UNIT).padStart(2, '0');

  return `$${groupThousands(String(whole))}.${fraction} ${currency}`;
}

/** Resultado de leer el campo de precio: vacío es ausencia; una forma inválida no es una ausencia. */
export type PriceParseResult =
  { readonly ok: true; readonly cents: number | null } | { readonly ok: false };

/**
 * Lee lo que la persona escribe en el campo de precio.
 *
 * Acepta un `$` inicial, espacios, dígitos y hasta dos decimales, con `.` o `,` como separador
 * decimal. **No** acepta separadores de miles: `1,250.50` no es una forma válida y el formulario lo
 * explica en vez de adivinar. Vacío es `null` —limpiar el precio—, no un cero.
 */
export function parsePriceInput(raw: string): PriceParseResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, cents: null };
  }

  const normalized = trimmed
    .replace(/^\$\s*/, '')
    .replace(/\s+/g, '')
    .replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return { ok: false };
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');
  const whole = Number(wholePart);
  if (!Number.isSafeInteger(whole)) {
    return { ok: false };
  }

  const fraction = Number(fractionPart.padEnd(2, '0'));
  const cents = whole * CENTS_PER_UNIT + fraction;

  if (!Number.isSafeInteger(cents) || cents > PRICE_LIMITS.cents) {
    return { ok: false };
  }

  return { ok: true, cents };
}

/** Valor inicial del campo de precio: `1250.50` o cadena vacía cuando el precio es nulo. */
export function priceInputValue(cents: number | null): string {
  if (cents === null) {
    return '';
  }

  const safe = Math.max(0, Math.trunc(cents));
  const whole = Math.floor(safe / CENTS_PER_UNIT);
  const fraction = String(safe % CENTS_PER_UNIT).padStart(2, '0');

  return `${String(whole)}.${fraction}`;
}
