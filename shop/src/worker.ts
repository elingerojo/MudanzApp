/**
 * `main` del Worker de `shop` (ciclo 4a, `event-index`).
 *
 * Desde el arranque, `shop` era un Worker de **solo assets**. Ahora gana un `main` que intercepta
 * `/evento/:publicSlug` y conserva `assets.not_found_handling: single-page-application` para el resto
 * del mapa: sin este `main` no hay forma de interceptar la navegación, y una redirección externa
 * cambiaría la URL y rompería la estabilidad del `publicSlug` (`plan-ciclo-4a` §4).
 *
 * La página del índice se sirve como **snapshot**: el backend devuelve el HTML ya renderizado y este
 * Worker lo incrusta en la shell de la SPA y lo guarda bajo la URL del índice. El snapshot nunca es
 * una dependencia dura: si el backend falla se sirve la última copia y, si no hay, la shell.
 *
 * Reglas del corte (§4 y §5):
 * - el snapshot vive fuera de `<app-root>`, porque `bootstrapApplication` reemplaza su contenido;
 * - nada personal entra en la copia: se pide al backend con `credentials: 'omit'` y **sin** reenviar
 *   cabeceras del visitante, así que la clave de la caché no tiene identidad;
 * - `X-Snapshot` hace observable el estado de la copia (`hit`, `miss`, `stale` o `shell`).
 *
 * El módulo exporta el handler para que la prueba unitaria lo ejerza con dobles deterministas; el
 * `export default` solo ata el objeto global `caches` en runtime de Workers.
 */

const EVENT_PREFIX = '/evento/';
const SNAPSHOT_SUFFIX = '/page';

/**
 * Una ficha pública es **un** segmento con la forma del `slug` del artículo. Los assets llevan
 * extensión (`/main.js`, `/favicon.svg`) y las rutas del mapa llevan más segmentos, así que no
 * entran. `evento` y `carrito` se excluyen por nombre: son rutas del mapa, no fichas.
 */
const LISTING_PATH = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const RESERVED_PATHS = new Set(['evento', 'carrito']);

/**
 * La ventana de la copia: exactamente el valor de `plan-ciclo-4a` §5 y el que el backend ya envía en
 * `/page`. Son 60 segundos con `stale-while-revalidate` de 10 minutos porque es el único reloj que
 * acota lo que ve un visitante cuando cambia la disponibilidad; cero pondría el backend en el camino
 * de cada visita.
 */
const SNAPSHOT_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=600';

/** Estado de la copia, tal como viaja en `X-Snapshot`. */
export type SnapshotState = 'hit' | 'miss' | 'stale' | 'shell';

/** Subconjunto del binding `assets` que este Worker usa. */
export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface ShopWorkerEnv {
  readonly ASSETS: AssetsBinding;
  /** Origen del backend, derivado del build desde la misma fuente que `environment.apiBaseUrl`. */
  readonly API_BASE_URL: string;
}

/** Lo que el Worker necesita de `ctx`: la escritura de la caché no debe retrasar la respuesta. */
export interface ShopExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** La caché del borde, aislada para que la prueba unitaria no dependa del runtime de Workers. */
export interface SnapshotCache {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
}

/** Copia la respuesta con la marca del estado. El cuerpo no se puede consumir dos veces. */
function tagged(response: Response, snapshot: SnapshotState): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Snapshot', snapshot);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * ¿Es una URL del índice? Exactamente `/evento/<slug>`: una ruta más profunda la resuelve la SPA y
 * una menos profunda no es un índice.
 */
function eventSlugOf(pathname: string): string | null {
  if (!pathname.startsWith(EVENT_PREFIX)) {
    return null;
  }

  const slug = pathname.slice(EVENT_PREFIX.length);
  return slug.length === 0 || slug.includes('/') ? null : slug;
}

/**
 * ¿Es una navegación a la ficha pública? Solo `GET`, solo si el visitante acepta HTML y solo un
 * segmento con la forma del `slug`. Las peticiones de assets y de la API no se interceptan.
 */
function listingSlugOf(request: Request, pathname: string): string | null {
  if (request.method !== 'GET') {
    return null;
  }

  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes('text/html')) {
    return null;
  }

  const match = LISTING_PATH.exec(pathname);
  const slug = match?.[1] ?? null;

  return slug === null || RESERVED_PATHS.has(slug) ? null : slug;
}

/** Inserta el fragmento antes de `</body>` para que quede **fuera** de `<app-root>`. */
export function injectSnapshot(shell: string, fragment: string): string {
  const closing = /<\/body>/i;
  if (closing.test(shell)) {
    return shell.replace(closing, `${fragment}\n</body>`);
  }

  return `${shell}\n${fragment}`;
}

async function fetchShell(env: ShopWorkerEnv, url: URL): Promise<Response> {
  const request = new Request(new URL('/', url).toString(), {
    headers: { accept: 'text/html' },
  });

  return env.ASSETS.fetch(request);
}

/** La shell de la SPA, con el estado que corresponde y sin cuerpo de snapshot. */
async function serveShell(
  env: ShopWorkerEnv,
  url: URL,
  status: number,
  snapshot: SnapshotState,
): Promise<Response> {
  const shell = await fetchShell(env, url);
  const body = await shell.text();

  return tagged(
    new Response(body, {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
    }),
    snapshot,
  );
}

/**
 * El handler del índice. Se exporta aparte del objeto del Worker para poder probarlo sin el runtime
 * de Cloudflare: recibe la caché como dependencia explícita.
 */
export async function handleEventoRequest(
  request: Request,
  env: ShopWorkerEnv,
  ctx: ShopExecutionContext,
  cache: SnapshotCache,
): Promise<Response> {
  const url = new URL(request.url);
  const slug = eventSlugOf(url.pathname);
  if (slug === null) {
    return env.ASSETS.fetch(request);
  }

  // Clave sin identidad: la URL del índice y nada más. Se normaliza la query fuera para que dos
  // visitantes con la misma ruta compartan la copia.
  const cacheKey = new Request(new URL(`/evento/${slug}`, url).toString(), { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached !== undefined) {
    return tagged(cached, 'hit');
  }

  const apiUrl = `${env.API_BASE_URL.replace(/\/+$/, '')}/public/events/${encodeURIComponent(slug)}${SNAPSHOT_SUFFIX}`;

  /**
   * Fallo del backend: la última copia guardada si existe y, si no, la shell. La copia se busca otra
   * vez porque una petición concurrente pudo guardarla mientras esta hablaba con el backend.
   */
  const staleOrShell = async (status: number): Promise<Response> => {
    const stale = await cache.match(cacheKey);
    return stale === undefined ? serveShell(env, url, status, 'shell') : tagged(stale, 'stale');
  };

  let upstream: Response;
  try {
    upstream = await fetch(apiUrl, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'manual',
      headers: { accept: 'text/html' },
    });
  } catch {
    return staleOrShell(200);
  }

  if (upstream.status === 200) {
    const fragment = await upstream.text();
    const shell = await fetchShell(env, url);
    const body = injectSnapshot(await shell.text(), fragment);

    const response = new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': SNAPSHOT_CACHE_CONTROL,
      },
    });

    const etag = upstream.headers.get('etag');
    if (etag !== null) {
      response.headers.set('etag', etag);
    }

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return tagged(response, 'miss');
  }

  // Un evento sin artículos es un enlace válido: la URL existe y la shell muestra su estado vacío.
  if (upstream.status === 204) {
    return serveShell(env, url, 200, 'shell');
  }

  // Mal formado o inexistente: el cuerpo es la shell para que el visitante vea el estado de la
  // aplicación, y el código es el que el crawler debe recibir (§5).
  if (upstream.status === 404) {
    return serveShell(env, url, 404, 'shell');
  }

  return staleOrShell(200);
}

/**
 * El handler de la ficha. Conserva la misma disciplina que el índice: copia sin identidad, `stale`
 * ante un fallo del backend y `410` con `noindex` cuando la cortesía de venta venció.
 */
export async function handleListingRequest(
  request: Request,
  env: ShopWorkerEnv,
  ctx: ShopExecutionContext,
  cache: SnapshotCache,
): Promise<Response> {
  const url = new URL(request.url);
  const slug = listingSlugOf(request, url.pathname);
  if (slug === null) {
    return env.ASSETS.fetch(request);
  }

  const cacheKey = new Request(new URL(`/${slug}`, url).toString(), { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached !== undefined) {
    return tagged(cached, 'hit');
  }

  const apiUrl = `${env.API_BASE_URL.replace(/\/+$/, '')}/public/listings/${encodeURIComponent(slug)}${SNAPSHOT_SUFFIX}`;

  const staleOrShell = async (status: number): Promise<Response> => {
    const stale = await cache.match(cacheKey);
    return stale === undefined ? serveShell(env, url, status, 'shell') : tagged(stale, 'stale');
  };

  let upstream: Response;
  try {
    upstream = await fetch(apiUrl, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'manual',
      headers: { accept: 'text/html' },
    });
  } catch {
    return staleOrShell(200);
  }

  if (upstream.status === 200) {
    const fragment = await upstream.text();
    const shell = await fetchShell(env, url);
    const body = injectSnapshot(await shell.text(), fragment);

    const response = new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': SNAPSHOT_CACHE_CONTROL,
      },
    });

    const etag = upstream.headers.get('etag');
    if (etag !== null) {
      response.headers.set('etag', etag);
    }

    const robots = upstream.headers.get('x-robots-tag');
    if (robots !== null) {
      response.headers.set('x-robots-tag', robots);
    }

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return tagged(response, 'miss');
  }

  if (upstream.status === 404) {
    return serveShell(env, url, 404, 'shell');
  }

  // La cortesía venció: la página sigue sin ser indexable y el visitante ve la shell de la SPA.
  if (upstream.status === 410) {
    const shell = await serveShell(env, url, 410, 'shell');
    shell.headers.set('x-robots-tag', 'noindex');
    return shell;
  }

  return staleOrShell(200);
}

/**
 * El objeto del Worker: ata la caché del borde y atrapa lo que se escape del handler. Un error
 * inesperado también termina en la última copia o en la shell, nunca en un `5xx` del Worker.
 */
export function createShopWorker(cache: SnapshotCache) {
  return {
    async fetch(
      request: Request,
      env: ShopWorkerEnv,
      ctx: ShopExecutionContext,
    ): Promise<Response> {
      const url = new URL(request.url);
      const eventSlug = eventSlugOf(url.pathname);

      if (eventSlug !== null) {
        try {
          return await handleEventoRequest(request, env, ctx, cache);
        } catch {
          const cacheKey = new Request(new URL(`/evento/${eventSlug}`, url).toString(), {
            method: 'GET',
          });
          const stale = await cache.match(cacheKey);

          return stale === undefined ? serveShell(env, url, 200, 'shell') : tagged(stale, 'stale');
        }
      }

      const listingSlug = listingSlugOf(request, url.pathname);
      if (listingSlug === null) {
        return env.ASSETS.fetch(request);
      }

      try {
        return await handleListingRequest(request, env, ctx, cache);
      } catch {
        const cacheKey = new Request(new URL(`/${listingSlug}`, url).toString(), { method: 'GET' });
        const stale = await cache.match(cacheKey);

        return stale === undefined ? serveShell(env, url, 200, 'shell') : tagged(stale, 'stale');
      }
    },
  };
}

/**
 * Caché del borde. Se resuelve dentro de la función porque `caches.default` no existe fuera del
 * runtime de Workers (y no está en los tipos del DOM que usa el build de Angular).
 */
function edgeCache(): SnapshotCache {
  const runtime = globalThis as unknown as {
    readonly caches: {
      readonly default: SnapshotCache;
    };
  };

  return runtime.caches.default;
}

export default createShopWorker({
  match: (key) => edgeCache().match(key),
  put: (key, response) => edgeCache().put(key, response),
});
