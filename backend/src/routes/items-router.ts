import {
  ITEM_LIMITS,
  createItemSchema,
  photoVariantSchema,
  photoVariantUploadSchema,
  updateItemSchema,
  type CreatedItem,
  type ItemList,
  type ItemPhoto,
  type ItemPhotoVariant,
  type ItemSummary,
} from '@mudanzapp/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';

import { canActOnEvent } from '../domain/account.js';
import {
  isAcceptedVariant,
  normalizeItemDraft,
  normalizeItemPatch,
  photoVariantContentType,
} from '../domain/item.js';
import { AppError } from '../errors.js';
import { findEventForUser } from '../store/identity-store.js';
import {
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
 *
 * El tope es **cordura de transporte**, no una regla de peso de la imagen: una variante optimizada
 * nunca se acerca a 5 MiB y una foto pesada entra igual si el codificador no la bajó del objetivo
 * (`plan-ciclo-3c-optimizar` §5).
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

      const payload: CreatedItem = {
        item: toItemSummary({ ...item, photoId: null, photoVariants: null }),
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
   * Revisión humana de una ficha ya capturada (`ai-draft`, ciclo 3d). Acepta `title` y `note` y exige
   * al menos uno: es la escritura con la que el humano aprueba lo que la IA propuso, y por eso es la
   * única ruta que crea la ficha definitiva.
   *
   * Autoriza con la misma regla que la lectura y escribe **solo** esos dos campos: medidas, foto y
   * borrado siguen fuera del corte (`plan-ciclo-3d` §2). Un artículo de otro evento responde
   * `item_not_found`, no `404 not_found`, porque el evento sí es suyo.
   */
  router.patch('/events/:eventId/items/:itemId', requireSession, (request, response, next) => {
    const handle = async (): Promise<void> => {
      const { eventId, itemId } = parseOrThrow(itemParamsSchema, request.params);
      const identity = identityOf(request);

      if (!(await canAct(identity, eventId))) {
        throw new AppError('not_found');
      }

      const input = parseOrThrow(updateItemSchema, request.body);
      const updated = await updateItem(deps.database, {
        eventId,
        itemId,
        patch: normalizeItemPatch(input),
      });
      if (!updated) {
        throw new AppError('item_not_found');
      }

      // Se relee para responder el `ItemSummary` completo, con su foto: el presentador se escribe una
      // sola vez, en la lectura, y no se duplica aquí.
      const item = await findItem(deps.database, eventId, itemId);
      if (item === null) {
        throw new AppError('item_not_found');
      }

      const payload: { readonly item: ItemSummary } = { item: toItemSummary(item) };
      response.status(200).json(payload);
    };

    void handle().catch(next);
  });

  /**
   * Subida de **una** variante: cuerpo binario crudo, el tipo declarado en la cabecera y la variante
   * con sus dimensiones reales en la URL. La posición 0 es la única del corte, así que una segunda
   * subida del mismo tamaño reemplaza el objeto anterior.
   *
   * El tamaño `large` crea o reemplaza la foto —y rellena las columnas heredadas, que es la deuda
   * declarada con el GC—; `medium` y `thumb` solo añaden su fila y exigen que la foto exista: una
   * variante suelta responde `item_not_found`.
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

      // La variante y sus medidas son parte del cuerpo de la petición: una desconocida, ausente o
      // fuera del tamaño de su variante es `photo_invalid`, el mismo código con el que el cliente ya
      // explica el rechazo (`plan-ciclo-3c-optimizar` §5).
      const upload = photoVariantUploadSchema.safeParse(request.query);
      if (!upload.success) {
        throw new AppError('photo_invalid');
      }

      const { variant, w, h } = upload.data;

      const contentType = photoVariantContentType(declaredContentType(request));
      if (contentType === null || !isAcceptedVariant(variant, contentType, w, h)) {
        throw new AppError('photo_invalid');
      }

      const bytes = await readPhotoBody(request);
      if (bytes.length === 0) {
        throw new AppError('photo_invalid');
      }

      const objectKey = newObjectKey(eventId, itemId, variant);
      await deps.storage.put(objectKey, bytes, contentType);

      const photoId =
        variant === 'large'
          ? (
              await upsertItemPhoto(deps.database, {
                itemId,
                objectKey,
                contentType,
                byteSize: bytes.length,
              })
            ).id
          : item.photoId;

      if (photoId === null) {
        throw new AppError('item_not_found');
      }

      await upsertPhotoVariant(deps.database, {
        photoId,
        variant,
        objectKey,
        contentType,
        widthPx: w,
        heightPx: h,
      });

      const variants = await findPhotoVariants(deps.database, photoId);
      const payload: { readonly photo: ItemPhoto } = {
        photo: toItemPhoto(photoId, variants),
      };
      response.status(200).json(payload);
    };

    void handle().catch(next);
  });

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
