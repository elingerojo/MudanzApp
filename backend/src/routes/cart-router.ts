import {
  cartPutSchema,
  eventPublicSlugSchema,
  type CartWriteResult,
  type IssuedCartRequest,
  type UnpublishedCartItem,
} from '@mudanzapp/shared';
import { Router, type Request } from 'express';

import { AppError } from '../errors.js';
import {
  cancelOpenCartRequest,
  findCart,
  findCartableListings,
  findOpenCartRequest,
  insertCartRequest,
  replaceCart,
  type CartRequestItemSnapshot,
  type OpenCartRequestRecord,
} from '../store/cart-store.js';
import { findPublicEventBySlug, type PublicEventRecord } from '../store/listing-store.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { toBuyerCartRequest, toPublicCart } from './presenters.js';
import { createSessionMiddleware, identityOf, type RequestIdentity } from './session.js';

/** Un parámetro de ruta que Express tipa como `string | string[]`: solo el texto simple es válido. */
function pathParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

/**
 * El carrito de seleccionados y su solicitud por WhatsApp (ciclo 4e, `cart-request`; decisión §44).
 *
 * Las cuatro rutas son **públicas en la URL** porque viven bajo el enlace del evento y exigen una
 * sesión de alcance `shop` por ruta: el token de la aplicación no las abre y el de la tienda no abre el
 * evento. El comprador nunca manda un identificador de otro: su carrito se resuelve con el sujeto de su
 * propia sesión y el `publicSlug` de la ruta.
 *
 * El orden de la frontera no se invierte y está en el plan §4.3. En particular, el teléfono del evento
 * se exige **antes** de devolver una solicitud ya abierta: el enlace `wa.me` es parte de la respuesta y
 * sin número no se puede componer.
 */
export function createPublicCartRouter(deps: IdentityDeps): Router {
  const router = Router();
  const requireShopSession = createSessionMiddleware(deps.database, 'shop');

  /**
   * El evento de la ruta. Un `publicSlug` mal formado y uno inexistente responden lo mismo
   * (`not_found`), igual que la ficha y el índice (`decisiones` §24).
   */
  const loadEvent = async (publicSlug: string): Promise<PublicEventRecord> => {
    const parsed = eventPublicSlugSchema.safeParse(publicSlug);
    if (!parsed.success) {
      throw new AppError('not_found');
    }

    const event = await findPublicBySlug(deps, parsed.data);
    if (event === null) {
      throw new AppError('not_found');
    }

    return event;
  };

  /**
   * El sujeto de la sesión. Una sesión de alcance `shop` es siempre de cuenta; una fila sin sujeto es
   * imposible por el modelo y falla en vez de inventar un dueño.
   */
  const buyerOf = (identity: RequestIdentity): string => {
    if (identity.user === null) {
      throw new AppError('unauthorized');
    }

    return identity.user.id;
  };

  /** La solicitud emitida, con su referencia, su enlace y su registro (B9). */
  const issued = (contactPhone: string, request: OpenCartRequestRecord): IssuedCartRequest => ({
    request: toBuyerCartRequest(request, contactPhone),
  });

  /**
   * `GET /public/events/:publicSlug/cart` — el carrito del comprador, **sin datos de otro**.
   *
   * Una lectura por visita con sesión (decisión §39): el `localStorage` pinta sin esperar y esto es
   * lo que reconcilia. Un comprador sin carrito recibe el carrito vacío, no un `404`: no tener carrito
   * es un estado, no un recurso ausente.
   */
  router.get('/public/events/:publicSlug/cart', requireShopSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const event = await loadEvent(pathParam(request.params.publicSlug));
      const userId = buyerOf(identityOf(request));

      const cart = await findCart(deps.database, { eventId: event.id, userId });
      const open = cart === null ? null : await findOpenCartRequest(deps.database, cart.id);

      response
        .set('Cache-Control', 'private, no-store')
        .json({ cart: toPublicCart(event, cart, open) });
    };

    void handle().catch(next);
  });

  /**
   * `PUT /public/events/:publicSlug/cart` — reemplaza el carrito entero y es idempotente (§39).
   *
   * Los `slug` se colapsan en orden de llegada. Un artículo que no se puede guardar —no es de este
   * evento, ya se vendió o no tiene precio— **no** hace fallar el acto: se devuelve en `dropped` y el
   * carrito resultante es el que se guardó. Un `409` perdería cuál sobró, porque el contrato de errores
   * no lleva carga.
   *
   * Desde F3 un artículo **despublicado** tiene su propio destino: se retira del carrito y se devuelve
   * en `unpublished` con su título, para que la pantalla diga por qué desapareció en vez de confundirlo
   * con «sin precio» o «vendido».
   */
  router.put('/public/events/:publicSlug/cart', requireShopSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const event = await loadEvent(pathParam(request.params.publicSlug));
      const input = parseOrThrow(cartPutSchema, request.body);
      const userId = buyerOf(identityOf(request));

      const slugs = [...new Set(input.slugs)];
      const listings = await findCartableListings(deps.database, { eventId: event.id, slugs });
      const bySlug = new Map(listings.map((listing) => [listing.slug, listing]));

      const kept: string[] = [];
      const dropped: string[] = [];
      const unpublished: UnpublishedCartItem[] = [];
      for (const slug of slugs) {
        const listing = bySlug.get(slug);
        if (listing === undefined) {
          dropped.push(slug);
          continue;
        }

        if (listing.unpublishedAt !== null) {
          unpublished.push({ slug: listing.slug, title: listing.title });
          continue;
        }

        if (listing.soldAt !== null || listing.priceCents === null) {
          dropped.push(slug);
          continue;
        }

        kept.push(listing.listingId);
      }

      const cartId = await deps.database.transaction((transaction) =>
        replaceCart(transaction, { userId, eventId: event.id, listingIds: kept }),
      );

      const cart = await findCart(deps.database, { eventId: event.id, userId });
      const open = await findOpenCartRequest(deps.database, cartId);

      const payload: CartWriteResult = {
        cart: toPublicCart(event, cart, open),
        dropped,
        unpublished,
      };
      response.set('Cache-Control', 'private, no-store').json(payload);
    };

    void handle().catch(next);
  });

  /**
   * `POST /public/events/:publicSlug/cart/request` — el comprador pide su carrito por WhatsApp.
   *
   * Reintentar devuelve la solicitud abierta con `200` en vez de crear otra: el índice único parcial
   * del DDL es la garantía, y el comprador ve la misma referencia. La instantánea de título y precio se
   * congela aquí; la solicitud **no** cambia el estado de ningún artículo.
   *
   * Desde B9 la respuesta lleva el registro completo —renglones, estado e importe vigente—, releído con
   * la misma consulta que el `GET` del carrito.
   */
  router.post(
    '/public/events/:publicSlug/cart/request',
    requireShopSession,
    (request: Request, response, next) => {
      const handle = async (): Promise<void> => {
        const event = await loadEvent(pathParam(request.params.publicSlug));
        const userId = buyerOf(identityOf(request));

        const cart = await findCart(deps.database, { eventId: event.id, userId });
        if (cart === null || cart.items.length === 0) {
          throw new AppError('cart_empty');
        }

        const contactPhone = event.contactPhone;
        if (contactPhone === null) {
          throw new AppError('whatsapp_not_configured');
        }

        const open = await findOpenCartRequest(deps.database, cart.id);
        if (open !== null) {
          response.status(200).json(issued(contactPhone, open));
          return;
        }

        // Un artículo despublicado ya no está a la vista: la solicitud no se emite con él. La lectura
        // del carrito lo retira con su aviso, pero dos peticiones pueden competir y el borde no confía
        // en que el cliente lo haya limpiado.
        if (cart.items.some((item) => item.unpublishedAt !== null)) {
          throw new AppError('listing_not_published');
        }

        // Un artículo cuyo precio se vació después de entrar al carrito no se puede pedir: el
        // comprador no puede aceptar un importe que ya no existe.
        if (cart.items.some((item) => item.priceCents === null)) {
          throw new AppError('price_missing');
        }

        if (cart.items.some((item) => item.soldAt !== null)) {
          throw new AppError('listing_sold');
        }

        const items: CartRequestItemSnapshot[] = cart.items.flatMap((item) =>
          item.priceCents === null
            ? []
            : [{ listingId: item.listingId, title: item.title, priceCents: item.priceCents }],
        );

        await deps.database.transaction((transaction) =>
          insertCartRequest(transaction, { cartId: cart.id, items }),
        );

        // B9: la respuesta es la **misma** lectura que el comprador ve al recargar. El insert no
        // reconstruye el registro por su cuenta; se relee para que la derivación siga siendo una sola.
        const created = await findOpenCartRequest(deps.database, cart.id);
        if (created === null) {
          throw new Error('cart-request-read-returned-no-row');
        }

        response.status(201).json(issued(contactPhone, created));
      };

      void handle().catch(next);
    },
  );

  /**
   * `DELETE /public/events/:publicSlug/cart/request` — el comprador cancela su solicitud.
   *
   * Idempotente: sin solicitud abierta también responde `204`, porque el estado deseado ya se cumple.
   * La fila no se borra; se escribe `cancelled_at`, que es la evidencia del acto en el panel.
   */
  router.delete(
    '/public/events/:publicSlug/cart/request',
    requireShopSession,
    (request: Request, response, next) => {
      const handle = async (): Promise<void> => {
        const event = await loadEvent(pathParam(request.params.publicSlug));
        const userId = buyerOf(identityOf(request));

        const cart = await findCart(deps.database, { eventId: event.id, userId });
        if (cart !== null) {
          await cancelOpenCartRequest(deps.database, { cartId: cart.id, now: deps.now() });
        }

        response.status(204).end();
      };

      void handle().catch(next);
    },
  );

  return router;
}

/** El evento por su `publicSlug`, aislado para que `loadEvent` no dependa del nombre del store. */
async function findPublicBySlug(
  deps: IdentityDeps,
  publicSlug: string,
): Promise<PublicEventRecord | null> {
  return findPublicEventBySlug(deps.database, publicSlug);
}
