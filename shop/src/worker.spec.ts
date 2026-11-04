import {
  handleEventoRequest,
  handleListingRequest,
  injectSnapshot,
  type ShopExecutionContext,
  type ShopWorkerEnv,
  type SnapshotCache,
} from './worker';

/**
 * El `main` del Worker de `shop` (ciclo 4a, `plan-ciclo-4a` §4 y §5).
 *
 * Se ejerce el handler con dobles deterministas: la caché es un `Map`, `ASSETS` devuelve una shell
 * fija y `fetch` se sustituye por la respuesta del backend. Lo que se demuestra es el contrato del
 * snapshot: `miss` guarda, `hit` sirve la copia, `shell` responde a un evento vacío y a un fallo, y
 * ninguna petición del visitante transporta identidad.
 */
const SHELL = '<!doctype html><html><body><app-root></app-root></body></html>';
const INDEX_URL = 'https://shop.test/evento/bogota-ciudad-de-mexico-3f9a2c';
const FRAGMENT =
  '<meta name="event-version" content="v1">\n<div id="evento-snapshot" data-testid="event-index-snapshot"><ul data-testid="event-index-list"></ul></div>';
const LISTING_URL = 'https://shop.test/mesa-de-roble-3f9a2c';
const LISTING_FRAGMENT =
  '<meta name="listing-version" content="v1">\n<div id="ficha-snapshot" data-testid="listing-snapshot"><article data-testid="listing"></article></div>';
/**
 * La ventana de la copia, escrita a mano: si la aserción leyera la constante del Worker, el valor
 * podría cambiar sin que nada se entere. El texto es el de `plan-ciclo-4a` §5.
 */
const SNAPSHOT_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=600';

interface MemoryCache extends SnapshotCache {
  readonly entries: Map<string, Response>;
}

function memoryCache(): MemoryCache {
  const entries = new Map<string, Response>();

  return {
    entries,
    match: (key) => Promise.resolve(entries.get(key.url)?.clone()),
    put: (key, response) => {
      entries.set(key.url, response.clone());
      return Promise.resolve();
    },
  };
}

function workerEnv(): ShopWorkerEnv {
  return {
    API_BASE_URL: 'https://api.test',
    ASSETS: {
      fetch: () =>
        Promise.resolve(
          new Response(SHELL, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
        ),
    },
  };
}

function context(): ShopExecutionContext & { readonly pending: Promise<unknown>[] } {
  const pending: Promise<unknown>[] = [];

  return { pending, waitUntil: (promise) => pending.push(promise) };
}

function upstream(response: Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response)),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleEventoRequest', () => {
  it('renders the shell with the snapshot on a miss and stores the copy', async () => {
    upstream(
      new Response(FRAGMENT, {
        status: 200,
        headers: { etag: '"v1"', 'content-type': 'text/html' },
      }),
    );
    const cache = memoryCache();
    const ctx = context();

    const response = await handleEventoRequest(new Request(INDEX_URL), workerEnv(), ctx, cache);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Snapshot')).toBe('miss');
    expect(response.headers.get('etag')).toBe('"v1"');
    expect(response.headers.get('cache-control')).toBe(SNAPSHOT_CACHE_CONTROL);
    expect(body).toContain('<app-root></app-root>');
    expect(body).toContain('id="evento-snapshot"');
    expect(body.indexOf('id="evento-snapshot"')).toBeGreaterThan(body.indexOf('<app-root>'));
    expect(body.indexOf('id="evento-snapshot"')).toBeLessThan(body.indexOf('</body>'));

    await Promise.all(ctx.pending);
    expect([...cache.entries.keys()]).toEqual([INDEX_URL]);
  });

  it('serves the stored copy on a hit without asking the backend again', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(FRAGMENT, { status: 200, headers: { etag: '"v1"' } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const cache = memoryCache();
    const env = workerEnv();

    await handleEventoRequest(new Request(INDEX_URL), env, context(), cache);

    // El `waitUntil` de la primera petición guardó la copia de forma síncrona en el `Map`.
    const second = await handleEventoRequest(new Request(INDEX_URL), env, context(), cache);

    expect(second.headers.get('X-Snapshot')).toBe('hit');
    expect(second.headers.get('cache-control')).toBe(SNAPSHOT_CACHE_CONTROL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await second.text()).toContain('id="evento-snapshot"');
  });

  it('serves the last stored copy, with its header, after a concurrent store', async () => {
    const stored = new Response(FRAGMENT, {
      status: 200,
      headers: { etag: '"v1"', 'cache-control': SNAPSHOT_CACHE_CONTROL },
    });

    // Primera lectura sin copia y segunda con ella: así se ejerce el camino `stale`, que solo ocurre
    // cuando otra petición guardó la copia mientras esta hablaba con el backend.
    let reads = 0;
    const cache: SnapshotCache = {
      match: () => {
        reads += 1;
        return Promise.resolve(reads === 1 ? undefined : stored.clone());
      },
      put: () => Promise.resolve(),
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network'))),
    );

    const response = await handleEventoRequest(
      new Request(INDEX_URL),
      workerEnv(),
      context(),
      cache,
    );

    expect(response.headers.get('X-Snapshot')).toBe('stale');
    expect(response.headers.get('cache-control')).toBe(SNAPSHOT_CACHE_CONTROL);
    expect(await response.text()).toContain('id="evento-snapshot"');
  });

  it('serves the shell, not a snapshot, for an event with no articles', async () => {
    upstream(new Response(null, { status: 204 }));
    const cache = memoryCache();

    const response = await handleEventoRequest(
      new Request(INDEX_URL),
      workerEnv(),
      context(),
      cache,
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Snapshot')).toBe('shell');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(body).not.toContain('id="evento-snapshot"');
    expect(cache.entries.size).toBe(0);
  });

  it('keeps the 404 of an unknown event with the shell as body', async () => {
    upstream(new Response('no', { status: 404 }));

    const response = await handleEventoRequest(
      new Request(INDEX_URL),
      workerEnv(),
      context(),
      memoryCache(),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('X-Snapshot')).toBe('shell');
  });

  it('falls back to the shell when the backend is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network'))),
    );

    const response = await handleEventoRequest(
      new Request(INDEX_URL),
      workerEnv(),
      context(),
      memoryCache(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Snapshot')).toBe('shell');
  });

  it('does not identify the visitor when asking for the snapshot', async () => {
    let captured: RequestInit | undefined;

    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown, init?: RequestInit) => {
        // La URL pedida es del backend; lo que importa es cómo se pidió.
        void input;
        captured = init;
        return Promise.resolve(new Response(FRAGMENT, { status: 200 }));
      }),
    );

    await handleEventoRequest(
      new Request(INDEX_URL, { headers: { cookie: 'session=abc', authorization: 'Bearer x' } }),
      workerEnv(),
      context(),
      memoryCache(),
    );

    expect(captured?.credentials).toBe('omit');
    expect(captured?.headers).toEqual({ accept: 'text/html' });
  });

  it('leaves every other route to the assets binding', async () => {
    const assets = vi.fn(() => Promise.resolve(new Response('asset')));
    const env: ShopWorkerEnv = { API_BASE_URL: 'https://api.test', ASSETS: { fetch: assets } };

    const response = await handleEventoRequest(
      new Request('https://shop.test/carrito'),
      env,
      context(),
      memoryCache(),
    );

    expect(await response.text()).toBe('asset');
    expect(response.headers.get('X-Snapshot')).toBeNull();
    expect(assets).toHaveBeenCalledTimes(1);
  });
});

describe('handleListingRequest', () => {
  function listingRequest(url = LISTING_URL): Request {
    return new Request(url, { headers: { accept: 'text/html' } });
  }

  it('renders the shell with the listing snapshot on a miss and stores the copy', async () => {
    upstream(
      new Response(LISTING_FRAGMENT, {
        status: 200,
        headers: { etag: '"v1"', 'content-type': 'text/html', 'x-robots-tag': 'noindex' },
      }),
    );
    const cache = memoryCache();
    const ctx = context();

    const response = await handleListingRequest(listingRequest(), workerEnv(), ctx, cache);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Snapshot')).toBe('miss');
    expect(response.headers.get('etag')).toBe('"v1"');
    expect(response.headers.get('cache-control')).toBe(SNAPSHOT_CACHE_CONTROL);
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(body).toContain('id="ficha-snapshot"');
    expect(body.indexOf('id="ficha-snapshot"')).toBeLessThan(body.indexOf('</body>'));

    await Promise.all(ctx.pending);
    expect([...cache.entries.keys()]).toEqual([LISTING_URL]);
  });

  it('serves the stored listing copy on a hit without asking the backend again', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(LISTING_FRAGMENT, { status: 200, headers: { etag: '"v1"' } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const cache = memoryCache();
    const env = workerEnv();

    await handleListingRequest(listingRequest(), env, context(), cache);
    const second = await handleListingRequest(listingRequest(), env, context(), cache);

    expect(second.headers.get('X-Snapshot')).toBe('hit');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await second.text()).toContain('id="ficha-snapshot"');
  });

  it('keeps the 404 of an unknown listing with the shell as body', async () => {
    upstream(new Response('no', { status: 404 }));

    const response = await handleListingRequest(
      listingRequest(),
      workerEnv(),
      context(),
      memoryCache(),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('X-Snapshot')).toBe('shell');
  });

  it('serves the shell with 410 and noindex when the courtesy is over', async () => {
    upstream(new Response(null, { status: 410 }));

    const response = await handleListingRequest(
      listingRequest(),
      workerEnv(),
      context(),
      memoryCache(),
    );
    const body = await response.text();

    expect(response.status).toBe(410);
    expect(response.headers.get('X-Snapshot')).toBe('shell');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(body).toContain('<app-root></app-root>');
    expect(body).not.toContain('id="ficha-snapshot"');
  });

  it('leaves assets, JSON and the event index to their own handlers', async () => {
    const assets = vi.fn(() => Promise.resolve(new Response('asset')));
    const env: ShopWorkerEnv = { API_BASE_URL: 'https://api.test', ASSETS: { fetch: assets } };

    const asset = await handleListingRequest(
      new Request('https://shop.test/main.js', { headers: { accept: 'text/html' } }),
      env,
      context(),
      memoryCache(),
    );
    const event = await handleListingRequest(
      new Request(INDEX_URL, { headers: { accept: 'text/html' } }),
      env,
      context(),
      memoryCache(),
    );
    const json = await handleListingRequest(
      new Request('https://shop.test/mesa-de-roble-3f9a2c', {
        headers: { accept: 'application/json' },
      }),
      env,
      context(),
      memoryCache(),
    );

    expect(await asset.text()).toBe('asset');
    expect(await event.text()).toBe('asset');
    expect(await json.text()).toBe('asset');
    expect(assets).toHaveBeenCalledTimes(3);
  });
});

describe('injectSnapshot', () => {
  it('puts the fragment outside the app root and before the closing body', () => {
    const html = injectSnapshot(SHELL, FRAGMENT);

    expect(html.indexOf('id="evento-snapshot"')).toBeGreaterThan(html.indexOf('<app-root>'));
    expect(html.indexOf('id="evento-snapshot"')).toBeLessThan(html.indexOf('</body>'));
  });

  it('appends the fragment when the shell has no closing body', () => {
    expect(injectSnapshot('<html></html>', FRAGMENT)).toContain('id="evento-snapshot"');
  });
});

describe('reserved map paths', () => {
  it('serves the shell for /cuenta instead of treating it as a listing slug', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleListingRequest(
      new Request('https://shop.test/cuenta', { headers: { accept: 'text/html' } }),
      workerEnv(),
      context(),
      memoryCache(),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get('X-Snapshot')).toBeNull();
    await expect(response.text()).resolves.toBe(SHELL);
  });
});
