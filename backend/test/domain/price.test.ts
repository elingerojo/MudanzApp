import {
  PRICE_LIMITS,
  formatPriceCents,
  parsePriceInput,
  priceInputValue,
} from '@mudanzapp/shared';

/**
 * El precio como texto y como entrada (ciclo 4b, `plan-ciclo-4b` §7 y decisión §35).
 *
 * La misma función compone la tarjeta, la ficha pública y la pantalla privada; por eso el formato no
 * usa `Intl` y la prueba fija el texto exacto, no una forma regional.
 */
describe('formatPriceCents', () => {
  it('formats cents with grouping and two decimals in the event currency', () => {
    expect(formatPriceCents(125_050, 'MXN')).toBe('$1,250.50 MXN');
    expect(formatPriceCents(123_456_789, 'MXN')).toBe('$1,234,567.89 MXN');
    expect(formatPriceCents(0, 'USD')).toBe('$0.00 USD');
  });

  it('keeps the absence of a price as words, not as zero', () => {
    expect(formatPriceCents(null, 'MXN')).toBe('Precio a consultar');
  });
});

describe('parsePriceInput', () => {
  it('accepts an empty field as clearing the price', () => {
    expect(parsePriceInput('   ')).toEqual({ ok: true, cents: null });
  });

  it('reads decimals with dot or comma', () => {
    expect(parsePriceInput('1250.50')).toEqual({ ok: true, cents: 125_050 });
    expect(parsePriceInput('1250,5')).toEqual({ ok: true, cents: 125_050 });
    expect(parsePriceInput('$ 1.05')).toEqual({ ok: true, cents: 105 });
  });

  it('rejects negative, more than two decimals and thousands separators', () => {
    expect(parsePriceInput('-1')).toEqual({ ok: false });
    expect(parsePriceInput('12.345')).toEqual({ ok: false });
    expect(parsePriceInput('1,250.50')).toEqual({ ok: false });
    expect(parsePriceInput('doce')).toEqual({ ok: false });
  });

  it('rejects a price above the shared limit', () => {
    expect(parsePriceInput(String((PRICE_LIMITS.cents + 1) / 100))).toEqual({ ok: false });
  });
});

describe('priceInputValue', () => {
  it('prefills the form with the stored cents and clears a null price', () => {
    expect(priceInputValue(125_050)).toBe('1250.50');
    expect(priceInputValue(null)).toBe('');
  });
});
