import { z } from 'zod';

import { listingSlugSchema } from './listing.js';

/**
 * Contrato del carrito de seleccionados y de su solicitud por WhatsApp (ciclo 4e,
 * `cart-request`; decisión §44, que supera a §38 y revisa a §39).
 *
 * El comprador guarda artículos en una lista por **comprador y evento** y, cuando quiere, pide esa
 * lista por WhatsApp. El hecho que el vendedor necesita —quién quiere qué, esta vez— lo guarda la
 * solicitud con su instantánea de título y precio; la conversación sigue **fuera** de la
 * aplicación.
 *
 * Cuatro reglas que este módulo no negocia:
 * - el carrito es del servidor y `localStorage` es solo su espejo; el `PUT` reemplaza entero;
 * - un artículo **sin precio** no entra al carrito, así que `priceCents` nunca es nulo aquí
 *   (`price_missing` es su código en el borde);
 * - el mensaje de WhatsApp lleva **solo** la referencia de la solicitud, que se deriva del `id` y
 *   no se guarda;
 * - el teléfono es del **vendedor** y se guarda como dígitos: `wa.me` no acepta `+`, espacios ni
 *   guiones.
 */

/** Límites del corte, en un solo lugar: el formulario, la frontera y el DDL usan los mismos números. */
export const CART_LIMITS = {
  /** Tope de artículos de un carrito; el `PUT` reemplaza entero. */
  items: 50,
  /** Caracteres del `id` que forman la referencia legible en WhatsApp y en el panel. */
  reference: 8,
  /** Dígitos del WhatsApp del vendedor: por debajo no es un número y por encima no es de este mundo. */
  phoneDigitsMin: 8,
  phoneDigitsMax: 15,
} as const;

/**
 * La forma de lo que se guarda en `app.event.contact_phone`. Es el mismo patrón que el `CHECK` de la
 * migración `010`: un cambio aquí exige el cambio del DDL, no al revés.
 */
export const WHATSAPP_NUMBER_PATTERN = '^[0-9]{8,15}$';

/**
 * Deja solo los dígitos y comprueba la longitud. `null` cuando no hay número utilizable: vacío,
 * demasiado corto o demasiado largo.
 *
 * No adivina un país ni descarta un prefijo internacional: lo que la persona escriba se conserva
 * dígito a dígito, porque el número es suyo y `wa.me` lo recibe tal cual.
 */
export function normalizeWhatsappNumber(input: string): string | null {
  const digits = input.replace(/[^0-9]/g, '');
  if (digits.length < CART_LIMITS.phoneDigitsMin || digits.length > CART_LIMITS.phoneDigitsMax) {
    return null;
  }

  return digits;
}

/** Resultado de leer el campo del WhatsApp: `null` es «sin número», no una forma inválida. */
export type ContactPhoneParse =
  { readonly ok: true; readonly value: string | null } | { readonly ok: false };

/**
 * Lee lo que el vendedor escribe en el campo del WhatsApp del evento.
 *
 * Vacío es `null` —quitar el número—, no un error. Cualquier otra cosa tiene que dejar entre 8 y 15
 * dígitos; si no, el formulario y la frontera responden `validation_failed` en vez de guardar un
 * número que no va a recibir nada.
 */
export function parseContactPhone(input: string | null): ContactPhoneParse {
  if (input === null || input.trim().length === 0) {
    return { ok: true, value: null };
  }

  const digits = normalizeWhatsappNumber(input);
  return digits === null ? { ok: false } : { ok: true, value: digits };
}

/**
 * La referencia de una solicitud: los primeros caracteres del `id`, sin guiones y en minúsculas.
 *
 * Es **derivada**, no guardada: el `id` ya es único y estable, y una columna nueva solo añadiría una
 * segunda forma del mismo hecho. No hay anillo de palabras: el de la invitación es de otro hecho
 * (decisión §42).
 */
export function cartRequestReference(id: string): string {
  return id
    .replace(/[^0-9a-z]/gi, '')
    .toLowerCase()
    .slice(0, CART_LIMITS.reference);
}

/**
 * El mensaje que el comprador envía. Lleva **solo** la referencia: el vendedor la busca en su panel y
 * el resto de la conversación ocurre en WhatsApp (decisión del dueño).
 */
export function cartRequestMessage(reference: string): string {
  return `Hola, quiero pedir estos artículos. Solicitud: ${reference}.`;
}

/**
 * El enlace que abre WhatsApp con el mensaje ya escrito. `phoneDigits` es el número del **vendedor**,
 * que el comprador ve porque va a escribirle; el texto viaja codificado.
 */
export function whatsappRequestUrl(phoneDigits: string, text: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

/** Tope de lo que acepta el campo del WhatsApp antes de normalizar (con `+`, espacios y guiones). */
const CONTACT_PHONE_INPUT_MAX = 40;

/**
 * `PUT /public/events/:publicSlug/cart`: el carrito entero. Los `slug` son la dirección pública del
 * artículo y el borde los colapsa; repetir uno no es un error, es el mismo artículo dos veces.
 */
export const cartPutSchema = z.object({
  slugs: z.array(listingSlugSchema).max(CART_LIMITS.items),
});

export type CartPutRequest = z.infer<typeof cartPutSchema>;

/**
 * `PATCH /events/:eventId/contact`: la forma de lo que se envía. La validez del número la decide
 * `parseContactPhone`, que es la única regla y la que la prueba pura ejercita.
 */
export const eventContactSchema = z.object({
  contactPhone: z.string().max(CONTACT_PHONE_INPUT_MAX).nullable(),
});

export type EventContactRequest = z.infer<typeof eventContactSchema>;

/**
 * Un artículo que el vendedor despublicó después de que el comprador lo guardó. El carrito no lo
 * esconde: lo retira con este aviso, que es la única forma de que el comprador entienda por qué ya no
 * está. `title` es la instantánea de la lectura que lo retiró.
 */
export interface UnpublishedCartItem {
  readonly slug: string;
  readonly title: string;
}

/**
 * Una fila del carrito. `addedAt` es cuándo lo guardó el comprador, no cuándo se publicó.
 *
 * `priceCents` es nulo solo si el vendedor **vacía** el precio después de que el artículo entró: el
 * borde no deja entrar uno sin precio (`price_missing`) y la solicitud tampoco se emite con uno en esa
 * forma. La fila lo publica tal cual en vez de esconderla o inventar un cero.
 */
export interface CartItem {
  readonly slug: string;
  readonly title: string;
  readonly priceCents: number | null;
  /** `null` mientras se puede pedir; el instante de la venta cuando el vendedor la cerró. */
  readonly soldAt: string | null;
  readonly addedAt: string;
}

/**
 * El importe agregado de una selección, en centavos.
 *
 * Suma `priceCents` de los artículos **visibles** del carrito. Es una función pura —no lee reloj, no
 * consulta la base y no conoce la moneda—: el texto lo compone `formatPriceCents` con la moneda del
 * evento, la misma regla que usa el precio por artículo.
 *
 * La selección vacía suma `0`. Devuelve `null` si algún artículo perdió el precio: un total incompleto
 * no es un total, y la fila que lo causó ya explica el hecho en la pantalla.
 */
export function cartTotal(items: readonly Pick<CartItem, 'priceCents'>[]): number | null {
  let total = 0;

  for (const item of items) {
    if (item.priceCents === null) {
      return null;
    }

    total += item.priceCents;
  }

  return Number.isSafeInteger(total) ? total : null;
}

/**
 * La solicitud abierta, tal como el comprador la necesita para volver a encontrarla después de
 * recargar: su referencia y **el enlace** que ya usó. No publica `cart_id` ni el comprador: es su
 * propia lectura.
 *
 * `whatsappUrl` es `null` solo si el vendedor quitó el número después de la solicitud. El enlace se
 * compone en el borde porque el teléfono no se publica como campo: el comprador lo ve al escribir.
 */
export interface OpenCartRequest {
  readonly id: string;
  readonly reference: string;
  readonly requestedAt: string;
  readonly whatsappUrl: string | null;
}

/**
 * `GET` y `PUT` del carrito: sus artículos, el evento al que pertenecen, si hay WhatsApp configurado
 * y la solicitud abierta, si existe. No publica `eventId`, `itemId` ni `listingId` (`decisiones`
 * §24): el `slug` es la dirección.
 *
 * `items` es lo que el comprador puede pedir o quitar; `unpublished` es lo que el vendedor retiró del
 * catálogo y el borde *ya quitó* de la selección. La lista viaja aparte para que la pantalla pueda
 * nombrar el artículo despublicado sin conservar una fila inerte en el carrito.
 */
export interface PublicCart {
  readonly event: {
    readonly publicSlug: string;
    readonly currency: string;
  };
  readonly items: readonly CartItem[];
  readonly unpublished: readonly UnpublishedCartItem[];
  /**
   * La suma de `items`, derivada y no guardada (ciclo B1). Es `0` con la selección vacía y `null` si
   * algún artículo perdió el precio; un total incompleto no se publica como cero.
   */
  readonly totalCents: number | null;
  /** `app.event.contact_phone IS NOT NULL`: es lo que habilita `Pídelos por WhatsApp`. */
  readonly whatsappAvailable: boolean;
  readonly request: OpenCartRequest | null;
}

/**
 * Resultado del `PUT`. `dropped` son los `slug` que no se pudieron guardar —vendidos, sin precio o
 * fuera del evento—: el contrato de errores no lleva carga, así que la respuesta dice cuáles
 * sobraron en vez de fallar entera.
 *
 * `unpublished` son los que se retiraron porque el vendedor los despublicó: es un hecho distinto de
 * «no se pudo guardar» y la pantalla lo explica con su propio aviso.
 */
export interface CartWriteResult {
  readonly cart: PublicCart;
  readonly dropped: readonly string[];
  readonly unpublished: readonly UnpublishedCartItem[];
}

/**
 * Resultado de pedir: la solicitud emitida, con su referencia y su enlace. Es la misma forma que la
 * lectura del carrito publica, así que recargar no pierde el enlace.
 */
export interface IssuedCartRequest {
  readonly request: OpenCartRequest;
}

/**
 * El estado de un artículo de la solicitud frente al catálogo de hoy (ciclo B8, `request-staleness`).
 *
 * La solicitud es una instantánea y **no se reescribe**: este estado se deriva al leer.
 * - `deleted` — el artículo o su publicación ya no existen (`listing_id` quedó nulo).
 * - `unpublished` — el vendedor lo despublicó después de la solicitud.
 * - `sold` — se vendió después de la solicitud.
 * - `price_changed` — el precio actual difiere de la instantánea.
 * - `current` — nada cambió.
 */
export type CartRequestItemState = 'current' | 'unpublished' | 'sold' | 'deleted' | 'price_changed';

/**
 * Un artículo de la instantánea de la solicitud: lo que el comprador pidió, con su precio de entonces,
 * y el estado que el catálogo de hoy le da (ciclo B8). `title` y `priceCents` no cambian nunca; el
 * estado y `currentPriceCents` son la lectura de hoy.
 *
 * `currentPriceCents` es `null` cuando el artículo ya no existe o el vendedor vació el precio; la
 * pantalla lo usa solo en `price_changed`.
 */
export interface CartRequestItem {
  readonly title: string;
  readonly priceCents: number;
  readonly state: CartRequestItemState;
  readonly currentPriceCents: number | null;
}

/**
 * Una solicitud tal como el dashboard la publica (ciclo 4e).
 *
 * `buyerName` es `app."user".display_name`, el único nombre que el modelo guarda (4d): el que el
 * proveedor aportó o el que el comprador fijó después. `items` es la instantánea del momento de
 * pedir, no el carrito de hoy; `listing_id` puede haber quedado nulo sin borrar la evidencia.
 */
export interface CartRequestSummary {
  readonly id: string;
  readonly reference: string;
  readonly buyerName: string;
  readonly itemCount: number;
  readonly items: readonly CartRequestItem[];
  /**
   * `true` si algún artículo de la instantánea ya no coincide con el catálogo actual (ciclo B8). Lo
   * deriva el presenter de `items`; no viaja como una segunda regla en el SQL.
   */
  readonly hasChanges: boolean;
  /**
   * El importe congelado del momento de pedir: la suma de `items`, que ya no cambian. Siempre es un
   * número porque la instantánea guarda un precio no nulo por artículo (ciclo B1).
   */
  readonly totalCents: number;
  readonly requestedAt: string;
  readonly dismissedAt: string | null;
  readonly cancelledAt: string | null;
}

/** El WhatsApp del evento, tal como su administrador lo lee y lo escribe. */
export interface EventContact {
  readonly contactPhone: string | null;
}
