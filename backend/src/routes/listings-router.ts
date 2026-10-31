import { listingSlugSchema, type PublicListing, type PublishedListing } from '@mudanzapp/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';

import { canActOnEvent } from '../domain/account.js';
import { listingSlug } from '../domain/listing.js';
import { AppError } from '../errors.js';
import { findEventForUser } from '../store/identity-store.js';
import { findItem } from '../store/item-store.js';
import { findListingByItemId, findListingBySlug, upsertListing } from '../store/listing-store.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { toPublicListing } from './presenters.js';
import { createSessionMiddleware, identityOf, type RequestIdentity } from './session.js';

const itemParamsSchema = z.object({ eventId: z.uuid(), itemId: z.uuid() });

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
 * Publicar exige foto: la hipótesis del ciclo es la foto compartida, y un artículo sin ella no la
 * responde. Un artículo sin foto responde `listing_photo_required` (409), que el cliente explica junto
 * al artículo y no como error genérico.
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

        // Republicar devuelve la publicación existente: el `slug` es un hecho publicado y no se
        // recalcula aunque el título haya cambiado.
        const existing = await findListingByItemId(deps.database, itemId);
        if (existing !== null) {
          response.status(200).json(published(existing.slug));
          return;
        }

        if (item.photoId === null) {
          throw new AppError('listing_photo_required');
        }

        const listing = await upsertListing(deps.database, {
          itemId,
          slug: listingSlug(item.title, itemId),
        });

        response.status(201).json(published(listing.slug));
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

  router.get('/public/listings/:slug', (request: Request, response, next) => {
    const handle = async (): Promise<void> => {
      const parsed = listingSlugSchema.safeParse(request.params.slug);
      if (!parsed.success) {
        throw new AppError('not_found');
      }

      const listing = await findListingBySlug(deps.database, parsed.data);
      if (listing === null) {
        throw new AppError('not_found');
      }

      const payload: PublicListing = toPublicListing(listing, (objectKey) =>
        deps.storage.publicUrl(objectKey),
      );

      response.set('Cache-Control', 'public, max-age=60').json(payload);
    };

    void handle().catch(next);
  });

  return router;
}
