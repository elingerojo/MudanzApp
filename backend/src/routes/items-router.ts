import {
  ITEM_LIMITS,
  createItemSchema,
  type CreatedItem,
  type ItemList,
  type ItemPhoto,
} from '@mudanzapp/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';

import { canActOnEvent } from '../domain/account.js';
import { isSupportedPhoto, normalizeItemDraft, photoContentType } from '../domain/item.js';
import { AppError } from '../errors.js';
import { findEventForUser } from '../store/identity-store.js';
import {
  findItem,
  findPhotoById,
  insertItem,
  listItemsForEvent,
  upsertItemPhoto,
} from '../store/item-store.js';
import { newObjectKey } from '../storage/object-store.js';
import { parseOrThrow } from '../validation.js';
import type { IdentityDeps } from './dependencies.js';
import { toItemSummary } from './presenters.js';
import { createSessionMiddleware, identityOf, type RequestIdentity } from './session.js';

const eventParamsSchema = z.object({ eventId: z.uuid() });
const itemParamsSchema = z.object({ eventId: z.uuid(), itemId: z.uuid() });
const photoParamsSchema = z.object({ photoId: z.uuid() });

/**
 * El tipo declarado, sin parámetros: `image/jpeg; charset=…` y `IMAGE/JPEG` son el mismo tipo.
 * Se lee de la cabecera y no del parser porque aquí no hay parser: la foto llega como cuerpo crudo.
 */
function declaredContentType(request: Request): string {
  const header = request.headers['content-type'] ?? '';
  const [first] = header.split(';');
  return (first ?? '').trim().toLowerCase();
}

/**
 * Lee el cuerpo binario con un tope propio. No se usa un parser de Express porque su rechazo por
 * tamaño se convertiría en un 500 del manejador genérico; aquí el exceso es `photo_invalid`, que es
 * lo que el cliente sabe interpretar (`05` §2).
 */
async function readPhotoBody(request: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > ITEM_LIMITS.photoBytes) {
      throw new AppError('photo_invalid');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

/**
 * Artículos del evento y su foto (`capture`, ciclo 3a).
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

      const payload: CreatedItem = {
        item: toItemSummary({
          ...item,
          photoId: null,
          photoContentType: null,
          photoByteSize: null,
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
   * Subida de la foto: cuerpo binario crudo, con el `Content-Type` declarado en la cabecera. La
   * posición 0 es la única del corte, así que una segunda subida reemplaza la anterior.
   *
   * El objeto se escribe **antes** que su fila: si la fila falla, queda un objeto huérfano en el
   * almacén, que es un daño menor y reversible; al revés, la fila apuntaría a una foto inexistente.
   */
  router.put('/events/:eventId/items/:itemId/photo', requireSession, (request, response, next) => {
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

      const contentType = photoContentType(declaredContentType(request));
      if (contentType === null) {
        throw new AppError('photo_invalid');
      }

      const bytes = await readPhotoBody(request);
      if (!isSupportedPhoto(contentType, bytes.length)) {
        throw new AppError('photo_invalid');
      }

      const objectKey = newObjectKey(eventId, itemId);
      await deps.storage.put(objectKey, bytes, contentType);

      const photo = await upsertItemPhoto(deps.database, {
        itemId,
        objectKey,
        contentType,
        byteSize: bytes.length,
      });

      const payload: { readonly photo: ItemPhoto } = {
        photo: { id: photo.id, contentType: photo.contentType, byteSize: photo.byteSize },
      };
      response.status(200).json(payload);
    };

    void handle().catch(next);
  });

  /**
   * Lectura de la foto. Exige sesión del evento del artículo y responde `item_not_found` tanto si la
   * foto no existe como si es de un evento ajeno: no se distingue ajeno de inexistente (§24).
   */
  router.get('/photos/:photoId', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { photoId } = parseOrThrow(photoParamsSchema, request.params);
      const identity = identityOf(request);

      const photo = await findPhotoById(deps.database, photoId);
      if (photo === null || !(await canAct(identity, photo.eventId))) {
        throw new AppError('item_not_found');
      }

      const object = await deps.storage.get(photo.objectKey);
      if (object === null) {
        throw new AppError('item_not_found');
      }

      response
        .set('Content-Type', object.contentType)
        .set('Cache-Control', 'private, no-store')
        .send(object.bytes);
    };

    void handle().catch(next);
  });

  return router;
}
