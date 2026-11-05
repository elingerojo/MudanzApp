import {
  CART_LIMITS,
  cartPutSchema,
  cartRequestMessage,
  cartRequestReference,
  eventContactSchema,
  normalizeWhatsappNumber,
  parseContactPhone,
  whatsappRequestUrl,
} from '@mudanzapp/shared';

/**
 * El carrito de seleccionados y su solicitud (ciclo 4e, `plan-ciclo-4e` §7).
 *
 * Todo lo que se prueba aquí es **puro**: la forma del WhatsApp del vendedor, el enlace que abre el
 * comprador y la referencia que lleva el mensaje. Nada de esto depende de la base ni del navegador, y
 * por eso se puede fijar el texto exacto en vez de una forma regional.
 */
describe('normalizeWhatsappNumber', () => {
  it('keeps only digits, because wa.me rejects a plus, spaces and dashes', () => {
    expect(normalizeWhatsappNumber('+52 55 1234 5678')).toBe('525512345678');
    expect(normalizeWhatsappNumber('(55) 1234-5678')).toBe('5512345678');
  });

  it('rejects an empty number and one outside the contract range', () => {
    expect(normalizeWhatsappNumber('   ')).toBeNull();
    expect(normalizeWhatsappNumber('1234567')).toBeNull();
    expect(normalizeWhatsappNumber('1234567890123456')).toBeNull();
  });
});

describe('parseContactPhone', () => {
  it('treats an empty field as clearing the number, not as an error', () => {
    expect(parseContactPhone(null)).toEqual({ ok: true, value: null });
    expect(parseContactPhone('   ')).toEqual({ ok: true, value: null });
  });

  it('normalizes a number that can receive messages and rejects the rest', () => {
    expect(parseContactPhone('+52 55 1234 5678')).toEqual({ ok: true, value: '525512345678' });
    expect(parseContactPhone('doce')).toEqual({ ok: false });
    expect(parseContactPhone('12345')).toEqual({ ok: false });
  });
});

describe('cartRequestReference', () => {
  it('derives the same short reference from the same id, in any case', () => {
    expect(cartRequestReference('abcdef12-3456-4789-8abc-def012345678')).toBe('abcdef12');
    expect(cartRequestReference('ABCDEF12-3456-4789-8ABC-DEF012345678')).toBe('abcdef12');
  });

  it('keeps the contract length', () => {
    expect(cartRequestReference('1-2-3-4-5-6-7-8-9')).toHaveLength(CART_LIMITS.reference);
  });
});

describe('whatsappRequestUrl', () => {
  it('composes the link with the digits and the encoded message', () => {
    const text = 'Hola, quiero pedir estos artículos. Solicitud: ab12cd34.';

    expect(whatsappRequestUrl('525512345678', text)).toBe(
      `https://wa.me/525512345678?text=${encodeURIComponent(text)}`,
    );
  });

  it('carries only the reference: no price and no article list', () => {
    const message = cartRequestMessage('ab12cd34');

    expect(message).toContain('ab12cd34');
    expect(message).not.toContain('$');
  });
});

describe('cartPutSchema', () => {
  it('accepts public slugs and rejects a payload that is not the contract', () => {
    expect(cartPutSchema.safeParse({ slugs: ['silla-abc123', 'mesa-def456'] }).success).toBe(true);
    expect(cartPutSchema.safeParse({ slugs: ['Silla'] }).success).toBe(false);
    expect(cartPutSchema.safeParse({}).success).toBe(false);
  });

  it('stops at the cart limit', () => {
    const slugs = Array.from(
      { length: CART_LIMITS.items + 1 },
      (_, index) => `articulo-${String(index)}`,
    );

    expect(cartPutSchema.safeParse({ slugs }).success).toBe(false);
  });
});

describe('eventContactSchema', () => {
  it('accepts the raw shape of the form and an explicit null', () => {
    expect(eventContactSchema.safeParse({ contactPhone: '+52 55 1234 5678' }).success).toBe(true);
    expect(eventContactSchema.safeParse({ contactPhone: null }).success).toBe(true);
    expect(eventContactSchema.safeParse({}).success).toBe(false);
  });
});
