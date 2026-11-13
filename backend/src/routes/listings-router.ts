import {
  eventPublicSlugSchema,
  listingSlugSchema,
  listingState,
  type PublicEventIndex,
  type PublicListing,
  type PublishedListing,
  type UpdatedItem,
} from '@mudanzapp/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';

import { canActOnEvent } from '../domain/account.js';
import { hasEveryVariant } from '../domain/item.js';
import { listingSlug } from '../domain/listing.js';
import { AppError } from '../errors.js';
import { renderEventIndexPage } from '../render/event-index-page.js';
import { renderListingPage } from '../render/listing-page.js';
import { findEventForUser } from '../store/identity-store.js';
import { findItem } from '../store/item-store.js';
import {
  findListingByItemId,
  findListingBySlug,
  findPublicEventIndex,
  markListingSold,
  unpublishListing,
  upsertListing,
} from '../store/listing-store.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import {
  toItemSummary,
  toPublicEventIndex,
  toPublicListing,
  toPublicListingCard,
} from './presenters.js';
import { createSessionMiddleware, identityOf, type RequestIdentity } from './session.js';

const itemParamsSchema = z.object({ eventId: z.uuid(), itemId: z.uuid() });

/** Un parámetro de ruta que Express tipa como `string | string[]`: solo el texto simple es válido. */
function pathParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

/** El contrato de publicar: la dirección y su camino relativo, sin origen. */
function published(slug: string): PublishedListing {
  return { slug, path: `/${slug}` };
}

/**
 * Publicación del artículo (`publish`, ciclo 3c).
 *
 * `POST` publica **un** artículo por enlace y es idempotente: la primera vez responde `201` y
 * republicar devuelve el mismo `slug` con `200`, así que el botón no crea una URL nueva ni falla al
 * repetirse. La autorización es la misma regla que el resto de la superficie privada —sesión del
 * evento o membresía— y se ejerce aquí, no en la URL (`decisiones` §24).
 *
 * Publicar exige foto **en sus tres tamaños**: la hipótesis del ciclo es la foto compartida, y la
 * ficha pública se comparte por sus tamaños (`plan-ciclo-3c-optimizar` §3). Un artículo sin foto o con
 * una sola variante responde `listing_photo_required` (409) con el mismo código estable, y el cliente
 * explica que hay que volver a subir la foto. Los ya publicados siguen respondiendo `200`.
 */
export function createListingsRouter(deps: IdentityDeps): Router {
  const router = Router();
  const requireSession = createSessionMiddleware(deps.database);

  const canAct = async (identity: RequestIdentity, eventId: string): Promise<boolean> => {
    const isMember =
      identity.user === null
        ? false
        : (await findEventForUser(deps.database, eventId, identity.user.id)) !== null;

    return canActOnEvent(
      { eventId: identity.eventId, userId: identity.user?.id ?? null },
      eventId,
      isMember,
    );
  };

  router.post(
    '/events/:eventId/items/:itemId/listing',
    requireSession,
    (request, response, next) => {
      const handle = async (): Promise<void> => {
        const { eventId, itemId } = parseOrThrow(itemParamsSchema, request.params);
        const identity = identityOf(request);

        if (!(await canAct(identity, eventId))) {
          throw new AppError('not_found');
        }

        const item = await findItem(deps.database, eventId, itemId);
        if (item === null) {
          throw new AppError('item_not_found');
        }

        // Una ficha ya a la vista no se toca: el `slug` es un hecho publicado y no se recalcula aunque
        // el título haya cambiado. Una **despublicada** sí se restaura: la misma URL vuelve al catálogo
        // y `published_at` pasa a `now()`, así que sube al tope del índice (decisión del dueño, F3).
        const existing = await findListingByItemId(deps.database, itemId);
        if (existing !== null && existing.unpublishedAt === null) {
          response.status(200).json(published(existing.slug));
          return;
        }

        // Republicar también exige la portada en sus tres tamaños: una ficha que perdió sus variantes
        // no vuelve a la vista con un hueco. Desde 3e la portada es la primera foto de la galería.
        const cover = item.photos[0] ?? null;
        if (cover === null || !hasEveryVariant(cover.variants)) {
          throw new AppError('listing_photo_required');
        }

        const listing = await upsertListing(deps.database, {
          itemId,
          slug: listingSlug(item.title, itemId),
        });

        // `201` la primera vez; `200` cuando la fila ya existía y el acto la devolvió a la vista.
        response.status(existing === null ? 201 : 200).json(published(listing.slug));
      };

      void handle().catch(next);
    },
  );

  /**
   * `POST /events/:eventId/items/:itemId/sold` — el vendedor declara la venta (ciclo 4b, §40).
   *
   * Vender no es borrar: escribe `app.listing.sold_at` y conserva artículo, foto y URL. Es
   * idempotente; reintentar no reescribe la fecha. Un artículo sin publicación responde
   * `listing_not_published` (409), porque vender no es publicar.
   */
  router.post('/events/:eventId/items/:itemId/sold', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId, itemId } = parseOrThrow(itemParamsSchema, request.params);
      const identity = identityOf(request);

      if (!(await canAct(identity, eventId))) {
        throw new AppError('not_found');
      }

      const item = await findItem(deps.database, eventId, itemId);
      if (item === null) {
        throw new AppError('item_not_found');
      }

      // Una ficha retirada del catálogo no se vende sin volver a publicarla: el acto se explica con el
      // mismo código estable que «no está publicada».
      if (item.unpublishedAt !== null) {
        throw new AppError('listing_not_published');
      }

      const sold = await markListingSold(deps.database, itemId, deps.now());
      if (sold === null) {
        throw new AppError('listing_not_published');
      }

      const fresh = await findItem(deps.database, eventId, itemId);
      if (fresh === null) {
        throw new AppError('item_not_found');
      }

      const payload: UpdatedItem = { item: toItemSummary(fresh) };
      response.json(payload);
    };

    void handle().catch(next);
  });

  /**
   * `DELETE /events/:eventId/items/:itemId/listing` — el vendedor retira la ficha del catálogo (F3).
   *
   * Despublicar **no** borra: escribe `app.listing.unpublished_at` y conserva la foto, el artículo y
   * el `slug`. La URL compartida responde `410 listing_unpublished` en la siguiente lectura y el
   * índice del evento deja de enumerarla. Republicar es el `POST` de arriba y restaura la misma URL.
   *
   * Es idempotente: una ficha ya despublicada o que nunca se publicó responde `204`, porque el estado
   * deseado ya se cumple. Una vendida responde `item_sold` (409): la venta es su evidencia y no se
   * retira (§40). La autorización es la misma que publicar, no la del panel de administración.
   */
  router.delete(
    '/events/:eventId/items/:itemId/listing',
    requireSession,
    (request, response, next) => {
      const handle = async (): Promise<void> => {
        const { eventId, itemId } = parseOrThrow(itemParamsSchema, request.params);
        const identity = identityOf(request);

        if (!(await canAct(identity, eventId))) {
          throw new AppError('not_found');
        }

        const item = await findItem(deps.database, eventId, itemId);
        if (item === null) {
          throw new AppError('item_not_found');
        }

        if (item.soldAt !== null) {
          throw new AppError('item_sold');
        }

        // El `UPDATE` conserva el primer instante y no toca una ficha vendida aunque dos peticiones
        // compitan; el `findItem` de arriba ya dio la respuesta exacta para el caso normal.
        await unpublishListing(deps.database, itemId, deps.now());

        response.status(204).end();
      };

      void handle().catch(next);
    },
  );

  return router;
}

/**
 * Lectura pública de la ficha (`publish`, ciclo 3c).
 *
 * **Sin credencial**: es el enlace que se comparte por WhatsApp y lo abre cualquiera. Un `slug` que no
 * cumple el patrón y uno que no existe responden lo mismo (`not_found`), porque distinguirlos solo
 * añadiría una superficie de sondeo (`decisiones` §24).
 *
 * La URL de la foto la compone el almacén (`ObjectStore.publicUrl`), no esta ruta: el navegador
 * descarga la imagen del almacén público y el backend no sirve bytes en el camino de la ficha
 * (decisión §26).
 */
export function createPublicListingsRouter(deps: IdentityDeps): Router {
  const router = Router();

  /**
   * El índice de un evento, resuelto una sola vez para las dos lecturas públicas. Un `publicSlug`
   * mal formado y uno inexistente responden lo mismo (`not_found`): la ruta no distingue «no existe»
   * de «no cumple el patrón» (`decisiones` §24).
   */
  const loadEventIndex = async (publicSlug: string): Promise<PublicEventIndex> => {
    const parsed = eventPublicSlugSchema.safeParse(publicSlug);
    if (!parsed.success) {
      throw new AppError('not_found');
    }

    const found = await findPublicEventIndex(deps.database, parsed.data);
    if (found === null) {
      throw new AppError('not_found');
    }

    return toPublicEventIndex(
      found.event,
      found.listings.map((listing) =>
        toPublicListingCard(listing, (objectKey) => deps.storage.publicUrl(objectKey)),
      ),
    );
  };

  /**
   * `GET /public/events/:publicSlug` — el índice como JSON, **sin sesión**.
   *
   * Publica `version` y las tarjetas. No publica `eventId`, `itemId` ni `object_key`: es el mismo
   * contrato que el snapshot sirve como HTML, así que la SPA y el HTML no pueden describir estados
   * distintos (`plan-ciclo-4a` §5).
   */
  router.get('/public/events/:publicSlug', (request: Request, response, next) => {
    const handle = async (): Promise<void> => {
      const payload = await loadEventIndex(pathParam(request.params.publicSlug));
      response.set('Cache-Control', 'public, max-age=60').json(payload);
    };

    void handle().catch(next);
  });

  /**
   * `GET /public/events/:publicSlug/page` — el snapshot como HTML, **sin sesión**. No es una URL del
   * usuario: la pide el Worker de `shop` y la incrusta en la shell de la SPA.
   *
   * - `200` con el fragmento y su `ETag`, que es la clave de versión;
   * - `204` cuando el evento existe y no tiene artículos: el índice nace con la primera publicación,
   *   la URL no (§3);
   * - `404` con el mismo criterio que la ficha.
   *
   * El TTL es el único reloj que acota lo que ve un visitante cuando cambia la disponibilidad; con
   * `version` en la clave, corregir la copia cuesta una lectura y una renderización (§5).
   */
  router.get('/public/events/:publicSlug/page', (request: Request, response, next) => {
    const handle = async (): Promise<void> => {
      const payload = await loadEventIndex(pathParam(request.params.publicSlug));
      if (payload.listings.length === 0) {
        response.status(204).end();
        return;
      }

      response.set('ETag', `"${payload.version}"`);
      response.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
      response.type('text/html').send(renderEventIndexPage(payload));
    };

    void handle().catch(next);
  });

  /**
   * La ficha pública, resuelta una sola vez para sus dos lecturas. Un `slug` mal formado y uno
   * inexistente responden lo mismo (`not_found`). El estado se decide con el reloj inyectado:
   * `live`, `sold` dentro de la cortesía o `gone` después. Una ficha despublicada (F3) no tiene
   * cuerpo público: solo el `410` con `noindex`.
   */
  type PublicListingState = 'live' | 'sold' | 'gone';
  type LoadedPublicListing =
    | { readonly state: 'unpublished' }
    | { readonly state: PublicListingState; readonly listing: PublicListing };

  const loadListing = async (slug: string): Promise<LoadedPublicListing> => {
    const parsed = listingSlugSchema.safeParse(slug);
    if (!parsed.success) {
      throw new AppError('not_found');
    }

    const found = await findListingBySlug(deps.database, parsed.data);
    if (found === null) {
      throw new AppError('not_found');
    }

    if (found.unpublishedAt !== null) {
      return { state: 'unpublished' };
    }

    const listing = toPublicListing(found, (objectKey) => deps.storage.publicUrl(objectKey));

    return { listing, state: listingState(listing.soldAt, deps.now()) };
  };

  /** `GET /public/listings/:slug` — la ficha como JSON, **sin sesión**. */
  router.get('/public/listings/:slug', (request: Request, response, next) => {
    const handle = async (): Promise<void> => {
      const loaded = await loadListing(pathParam(request.params.slug));

      if (loaded.state === 'unpublished') {
        response.set('X-Robots-Tag', 'noindex').status(410).json({ error: 'listing_unpublished' });
        return;
      }

      const { listing, state } = loaded;

      if (state === 'gone') {
        response.set('X-Robots-Tag', 'noindex').status(410).json({ error: 'listing_gone' });
        return;
      }

      if (state === 'sold') {
        response.set('X-Robots-Tag', 'noindex');
      }

      response.set('Cache-Control', 'public, max-age=60').json(listing);
    };

    void handle().catch(next);
  });

  /**
   * `GET /public/listings/:slug/page` — el snapshot HTML de la ficha, **sin sesión**. No es una URL
   * del usuario: la pide el Worker de `shop` y la incrusta en la shell de la SPA.
   *
   * Una ficha vendida conserva el `200` durante la cortesía y lo abandona con `410` al vencer; en los
   * dos casos la respuesta lleva `noindex`, que es la cortesía declarada en `plan-ciclo-4a` §5.
   */
  router.get('/public/listings/:slug/page', (request: Request, response, next) => {
    const handle = async (): Promise<void> => {
      const loaded = await loadListing(pathParam(request.params.slug));

      if (loaded.state === 'unpublished') {
        response.set('X-Robots-Tag', 'noindex').status(410).end();
        return;
      }

      const { listing, state } = loaded;

      if (state === 'gone') {
        response.set('X-Robots-Tag', 'noindex').status(410).end();
        return;
      }

      if (state === 'sold') {
        response.set('X-Robots-Tag', 'noindex');
      }

      response.set('ETag', `"${listing.version}"`);
      response.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
      response.type('text/html').send(renderListingPage(listing));
    };

    void handle().catch(next);
  });

  return router;
}
