import {
  attachPhotosSchema,
  captureObjectKey,
  createItemSchema,
  photoVariantSchema,
  updateItemSchema,
  type AttachedPhotos,
  type CreatedItem,
  type ItemList,
  type ItemPhoto,
  type ItemPhotoVariant,
  type UpdatedItem,
} from '@mudanzapp/shared';
import { Router } from 'express';
import { z } from 'zod';

import { canActOnEvent } from '../domain/account.js';
import {
  isAcceptedVariant,
  normalizeItemDraft,
  normalizeItemUpdate,
  photoVariantContentType,
} from '../domain/item.js';
import { AppError } from '../errors.js';
import { findEventForUser } from '../store/identity-store.js';
import {
  deleteItem,
  findItem,
  findPhotoById,
  findPhotoVariants,
  insertItem,
  listItemsForEvent,
  updateItem,
  upsertItemPhoto,
  upsertPhotoVariant,
  type PhotoVariantRecord,
} from '../store/item-store.js';
import { newObjectKey } from '../storage/object-store.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { requireEventAdministrator } from './event-administration.js';
import { toItemPhoto, toItemSummary } from './presenters.js';
import { createSessionMiddleware, identityOf, type RequestIdentity } from './session.js';

const eventParamsSchema = z.object({ eventId: z.uuid() });
const itemParamsSchema = z.object({ eventId: z.uuid(), itemId: z.uuid() });
const photoParamsSchema = z.object({ photoId: z.uuid() });

/** `GET /photos/:photoId?variant=…`: la variante es opcional y su ausencia significa `large`. */
const photoQuerySchema = z.object({ variant: photoVariantSchema.optional() });

/** De mayor a menor: es el orden de la caída cuando la variante pedida no existe. */
const FALLBACK_ORDER: readonly ItemPhotoVariant[] = ['large', 'medium', 'thumb'];

/**
 * La variante pedida o, si no existe, la mayor disponible. Es la degradación declarada para las
 * fotos anteriores a 3c-optimizar y para una subida interrumpida: se sirve lo que hay, nunca se
 * finge un tamaño que no está.
 */
function pickVariant(
  variants: readonly PhotoVariantRecord[],
  requested: ItemPhotoVariant,
): PhotoVariantRecord | null {
  const byVariant = new Map(variants.map((variant) => [variant.variant, variant]));

  const exact = byVariant.get(requested);
  if (exact !== undefined) {
    return exact;
  }

  for (const candidate of FALLBACK_ORDER) {
    const found = byVariant.get(candidate);
    if (found !== undefined) {
      return found;
    }
  }

  return null;
}

/**
 * Artículos del evento y su foto (`capture`, ciclo 3a; tres tamaños desde 3c-optimizar).
 *
 * La autorización se ejerce en la escritura y en la lectura, nunca en la URL (`decisiones` §24):
 * un evento del que la sesión no puede disponer responde `not_found` y no se distingue del
 * inexistente; un artículo que no está en ese evento responde `item_not_found`.
 *
 * La foto se sirve **solo** con sesión del evento: en este corte no hay URL pública y por eso el
 * contrato entrega un identificador, no un enlace (`decisiones` §26 se ejerce en `publish`).
 */
export function createItemsRouter(deps: IdentityDeps): Router {
  const router = Router();
  const requireSession = createSessionMiddleware(deps.database);

  /**
   * ¿Puede esta sesión disponer del evento? Una sesión de evento llega solo a su propio evento; una
   * de cuenta, a los eventos donde es miembro. Es la misma regla que emite invitaciones y vive en el
   * núcleo (`canActOnEvent`), no aquí.
   */
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

  router.post('/events/:eventId/items', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const identity = identityOf(request);

      const input = parseOrThrow(createItemSchema, request.body);
      if (!(await canAct(identity, eventId))) {
        throw new AppError('not_found');
      }

      const item = await insertItem(deps.database, {
        eventId,
        draft: normalizeItemDraft(input),
      });

      // Un artículo recién creado no tiene foto ni fila en `app.listing`: todos esos hechos son `null`
      // y la pestaña `Capturados` lo pinta como `en proceso` hasta que se publique.
      const payload: CreatedItem = {
        item: toItemSummary({
          ...item,
          photoId: null,
          photoVariants: null,
          publishedSlug: null,
          unpublishedAt: null,
        }),
      };
      response.status(201).json(payload);
    };

    void handle().catch(next);
  });

  router.get('/events/:eventId/items', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId } = parseOrThrow(eventParamsSchema, request.params);
      const identity = identityOf(request);

      if (!(await canAct(identity, eventId))) {
        throw new AppError('not_found');
      }

      const items = await listItemsForEvent(deps.database, eventId);
      const payload: ItemList = { items: items.map(toItemSummary) };
      response.json(payload);
    };

    void handle().catch(next);
  });

  /**
   * `PATCH /events/:eventId/items/:itemId` — corrige la ficha y fija el precio (ciclo 4b).
   *
   * La autorización es la misma que capturar y publicar: una sesión del evento o un miembro de
   * cuenta. Un artículo ajeno responde `item_not_found`, igual que uno inexistente (§24). El `slug`
   * publicado no se toca: editar el título no reescribe la URL que ya se compartió (decisión §31).
   */
  router.patch('/events/:eventId/items/:itemId', requireSession, (request, response, next) => {
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

      const input = parseOrThrow(updateItemSchema, request.body);
      const updated = await updateItem(deps.database, eventId, itemId, normalizeItemUpdate(input));
      if (!updated) {
        throw new AppError('item_not_found');
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

  router.get('/events/:eventId/items/:itemId', requireSession, (request, response, next) => {
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

      response.json({ item: toItemSummary(item) });
    };

    void handle().catch(next);
  });

  /**
   * `DELETE /events/:eventId/items/:itemId` — el rey retira una captura equivocada (ciclo 4c-4).
   *
   * Borrar no es vender: `sold_at` es la evidencia de la venta y un artículo vendido responde
   * `item_sold` (409) en vez de desaparecer (decisión §40). El acto exige la frontera del panel
   * —primero el evento a la vista, después el derecho— que comparten la lectura del dashboard y el
   * borrado; un miembro sin reclamo y un co-dispositivo reciben `forbidden`.
   *
   * La cascada —foto, variantes y `app.listing`— la impone el DDL. La ficha pública deja de existir en
   * la siguiente lectura: no hay lápida ni `410` (`plan-ciclo-4c-event-admin` §8).
   */
  router.delete('/events/:eventId/items/:itemId', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId, itemId } = parseOrThrow(itemParamsSchema, request.params);
      const identity = identityOf(request);

      await requireEventAdministrator(deps.database, identity, eventId);

      const item = await findItem(deps.database, eventId, itemId);
      if (item === null) {
        throw new AppError('item_not_found');
      }

      if (item.soldAt !== null) {
        throw new AppError('item_sold');
      }

      const deleted = await deleteItem(deps.database, eventId, itemId);
      if (!deleted) {
        throw new AppError('item_not_found');
      }

      response.status(204).end();
    };

    void handle().catch(next);
  });

  /**
   * Adjunta una o varias capturas al artículo (ciclo 4g, `direct-upload`).
   *
   * El navegador ya subió las tres variantes a su clave de staging; aquí se verifica cada objeto con
   * `HEAD` —tipo, peso real y el tope del lado de su tamaño—, se copia a la clave definitiva, se
   * escriben las filas y se borra el staging. El arreglo y el `slot` existen desde el primer día para
   * que la galería de 3e no cambie el contrato.
   *
   * Se verifica **antes** de escribir: una captura incompleta responde `capture_incomplete` sin dejar
   * filas a medias, y un objeto con otro tipo o tamaño responde `photo_invalid`.
   */
  router.post(
    '/events/:eventId/items/:itemId/photos',
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

        const { captures } = parseOrThrow(attachPhotosSchema, request.body);

        const verified = await Promise.all(
          captures.map(async (capture) => {
            const variants = await Promise.all(
              capture.variants.map(async (variant) => {
                const key = captureObjectKey(eventId, capture.captureId, variant.variant);
                const head = await deps.storage.head(key);
                if (head === null) {
                  throw new AppError('capture_incomplete');
                }

                const contentType = photoVariantContentType(head.contentType);
                if (
                  contentType === null ||
                  !isAcceptedVariant(
                    variant.variant,
                    contentType,
                    variant.widthPx,
                    variant.heightPx,
                  )
                ) {
                  throw new AppError('photo_invalid');
                }

                return { ...variant, key, contentType, byteSize: head.byteSize };
              }),
            );

            return { slot: capture.slot, variants };
          }),
        );

        const photos: ItemPhoto[] = [];

        for (const capture of verified) {
          const copied = capture.variants.map((variant) => ({
            ...variant,
            finalKey: newObjectKey(eventId, itemId, variant.variant),
          }));

          const large = copied.find((variant) => variant.variant === 'large');
          if (large === undefined) {
            // El esquema exige las tres variantes; si falta, el defecto es del contrato, no del cliente.
            throw new AppError('internal_error');
          }

          await Promise.all(
            copied.map((variant) => deps.storage.copy(variant.key, variant.finalKey)),
          );

          const photo = await upsertItemPhoto(deps.database, {
            itemId,
            objectKey: large.finalKey,
            contentType: large.contentType,
            byteSize: large.byteSize,
            position: capture.slot,
          });

          for (const variant of copied) {
            await upsertPhotoVariant(deps.database, {
              photoId: photo.id,
              variant: variant.variant,
              objectKey: variant.finalKey,
              contentType: variant.contentType,
              widthPx: variant.widthPx,
              heightPx: variant.heightPx,
            });
          }

          photos.push(toItemPhoto(photo.id, await findPhotoVariants(deps.database, photo.id)));

          // El staging ya cumplió: se borra sin poder tumbar la respuesta (el barrido es la red).
          await Promise.allSettled(copied.map((variant) => deps.storage.delete(variant.key)));
        }

        const payload: AttachedPhotos = { photos };
        response.status(200).json(payload);
      };

      void handle().catch(next);
    },
  );

  /**
   * Lectura de una variante (`large` por defecto). Exige sesión del evento del artículo y responde
   * `item_not_found` tanto si la foto no existe como si es de un evento ajeno: no se distingue ajeno
   * de inexistente (§24).
   *
   * Una variante ausente se sirve con la mayor disponible y, si la foto es anterior a
   * 3c-optimizar, con la columna heredada: es la caída declarada del ciclo, no un silencio.
   */
  router.get('/photos/:photoId', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { photoId } = parseOrThrow(photoParamsSchema, request.params);
      const { variant } = parseOrThrow(photoQuerySchema, request.query);
      const identity = identityOf(request);

      const photo = await findPhotoById(deps.database, photoId);
      if (photo === null || !(await canAct(identity, photo.eventId))) {
        throw new AppError('item_not_found');
      }

      const variants = await findPhotoVariants(deps.database, photoId);
      const chosen = pickVariant(variants, variant ?? 'large');
      const objectKey = chosen?.objectKey ?? photo.objectKey;
      const contentType = chosen?.contentType ?? photo.contentType;

      const object = await deps.storage.get(objectKey);
      if (object === null) {
        throw new AppError('item_not_found');
      }

      response
        .set('Content-Type', contentType)
        .set('Cache-Control', 'private, no-store')
        .send(object.bytes);
    };

    void handle().catch(next);
  });

  return router;
}
