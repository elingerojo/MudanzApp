import {
  CART_EVENT_ID,
  CART_PUBLIC_SLUG,
  OPEN_REQUEST_ID,
  cartDatabase,
  type CartFixture,
  type CartListingFixture,
} from '../support/cart-fixture.js';
import { startTestApp } from '../support/test-app.js';

/**
 * La frontera del carrito de seleccionados y de su solicitud (ciclo 4e, `plan-ciclo-4e` §7).
 *
 * La hipótesis pide un recorrido y cuatro negativas:
 * - el comprador guarda, pide y cancela, y el `whatsappUrl` sale del número del vendedor;
 * - sin sesión de tienda no hay carrito (`401`);
 * - sin número configurado el acto no se emite (`409 whatsapp_not_configured`);
 * - un artículo vendido o sin precio no se pide (`409 listing_sold` y `409 price_missing`);
 * - el panel solo lo abre quien administra el evento (`403` para un co-dispositivo).
 *
 * El efecto real sobre la base —instantánea, cascada y supervivencia al borrado— se demuestra en
 * `test/db/cart.test.ts`, sobre la base y no sobre un doble.
 */
const NOW = new Date('2026-11-04T18:00:00.000Z');
const PHONE = '525512345678';

const AVAILABLE: CartListingFixture = {
  listingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  slug: 'silla-abc123',
  title: 'Silla',
  priceCents: 125_000,
  soldAt: null,
};

const SOLD: CartListingFixture = {
  listingId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  slug: 'mesa-def456',
  title: 'Mesa',
  priceCents: 90_000,
  soldAt: NOW,
};

const UNPRICED: CartListingFixture = {
  listingId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  slug: 'cama-ghi789',
  title: 'Cama',
  priceCents: null,
  soldAt: null,
};

const UNPUBLISHED: CartListingFixture = {
  listingId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  slug: 'ropero-jkl012',
  title: 'Ropero',
  priceCents: 45_000,
  soldAt: null,
  unpublishedAt: NOW,
};

/** Un artículo vigente cuyo precio cambió después de la solicitud (B8). */
const REPRICED: CartListingFixture = {
  listingId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  slug: 'sofa-mno345',
  title: 'Sofá',
  priceCents: 99_000,
  soldAt: null,
};

const BUYER = {
  token: 'buyer-token',
  userId: 'user-buyer',
  scope: 'shop' as const,
  displayName: 'Ana',
};
const DEVICE = {
  token: 'device-token',
  userId: null,
  scope: 'app' as const,
  eventId: CART_EVENT_ID,
};
const KING = {
  token: 'king-token',
  userId: 'user-king',
  scope: 'app' as const,
  displayName: 'Ana',
  isAdmin: false,
};

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function start(fixture: CartFixture) {
  const harness = cartDatabase(fixture);
  const app = await startTestApp('ok', '', { database: harness.database, now: () => NOW });

  return { app, harness };
}

function cartUrl(): string {
  return `/public/events/${CART_PUBLIC_SLUG}/cart`;
}

describe('public cart', () => {
  it('answers unauthorized without a session and with a session of the app scope', async () => {
    const withoutToken = await start({ sessions: [BUYER] });

    try {
      const response = await fetch(`${withoutToken.app.baseUrl}${cartUrl()}`);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    } finally {
      await withoutToken.app.close();
    }

    const withAppToken = await start({ sessions: [BUYER, DEVICE] });

    try {
      const response = await fetch(`${withAppToken.app.baseUrl}${cartUrl()}`, {
        headers: bearer(DEVICE.token),
      });
      expect(response.status).toBe(401);
    } finally {
      await withAppToken.app.close();
    }
  });

  it('reads a buyer without a cart as an empty cart, not as a missing resource', async () => {
    const { app } = await start({ sessions: [BUYER] });

    try {
      const response = await fetch(`${app.baseUrl}${cartUrl()}`, {
        headers: bearer(BUYER.token),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        cart: {
          event: { publicSlug: CART_PUBLIC_SLUG, currency: 'MXN' },
          items: [],
          unpublished: [],
          totalCents: 0,
          whatsappAvailable: false,
          request: null,
        },
      });
    } finally {
      await app.close();
    }
  });

  it('publishes no total when an article in the cart lost its price', async () => {
    const { app } = await start({
      sessions: [BUYER],
      listings: [UNPRICED],
      cartItems: [UNPRICED.listingId],
    });

    try {
      const response = await fetch(`${app.baseUrl}${cartUrl()}`, {
        headers: bearer(BUYER.token),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        readonly cart: {
          readonly items: readonly { readonly slug: string }[];
          readonly totalCents: number | null;
        };
      };

      expect(payload.cart.items.map((item) => item.slug)).toEqual([UNPRICED.slug]);
      expect(payload.cart.totalCents).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('replaces the cart and reports what could not be kept', async () => {
    const { app, harness } = await start({
      sessions: [BUYER],
      listings: [AVAILABLE, SOLD, UNPRICED],
    });

    try {
      const response = await fetch(`${app.baseUrl}${cartUrl()}`, {
        method: 'PUT',
        headers: { ...bearer(BUYER.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugs: [AVAILABLE.slug, SOLD.slug, UNPRICED.slug, AVAILABLE.slug] }),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        readonly cart: {
          readonly items: readonly { readonly slug: string }[];
          readonly totalCents: number | null;
        };
        readonly dropped: readonly string[];
        readonly unpublished: readonly { readonly slug: string; readonly title: string }[];
      };

      expect(payload.cart.items.map((item) => item.slug)).toEqual([AVAILABLE.slug]);
      expect(payload.cart.totalCents).toBe(AVAILABLE.priceCents);
      expect(payload.dropped).toEqual([SOLD.slug, UNPRICED.slug]);
      expect(payload.unpublished).toEqual([]);
      expect(harness.state.items).toEqual([AVAILABLE.listingId]);
    } finally {
      await app.close();
    }
  });

  it('removes an unpublished article and reports it with its title', async () => {
    const { app, harness } = await start({
      sessions: [BUYER],
      listings: [AVAILABLE, UNPUBLISHED],
    });

    try {
      const response = await fetch(`${app.baseUrl}${cartUrl()}`, {
        method: 'PUT',
        headers: { ...bearer(BUYER.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugs: [AVAILABLE.slug, UNPUBLISHED.slug] }),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        readonly cart: { readonly items: readonly { readonly slug: string }[] };
        readonly dropped: readonly string[];
        readonly unpublished: readonly { readonly slug: string; readonly title: string }[];
      };

      // No es «no se pudo guardar» ni «vendido»: es un hecho propio y la pantalla lo nombra.
      expect(payload.cart.items.map((item) => item.slug)).toEqual([AVAILABLE.slug]);
      expect(payload.dropped).toEqual([]);
      expect(payload.unpublished).toEqual([{ slug: UNPUBLISHED.slug, title: UNPUBLISHED.title }]);
      expect(harness.state.items).toEqual([AVAILABLE.listingId]);
    } finally {
      await app.close();
    }
  });

  it('hides an unpublished article from the cart read and keeps it out of items', async () => {
    const { app } = await start({
      sessions: [BUYER],
      listings: [AVAILABLE, UNPUBLISHED],
      cartItems: [AVAILABLE.listingId, UNPUBLISHED.listingId],
    });

    try {
      const response = await fetch(`${app.baseUrl}${cartUrl()}`, {
        headers: bearer(BUYER.token),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        readonly cart: {
          readonly items: readonly { readonly slug: string }[];
          readonly unpublished: readonly { readonly slug: string; readonly title: string }[];
        };
      };

      expect(payload.cart.items.map((item) => item.slug)).toEqual([AVAILABLE.slug]);
      expect(payload.cart.unpublished).toEqual([
        { slug: UNPUBLISHED.slug, title: UNPUBLISHED.title },
      ]);
    } finally {
      await app.close();
    }
  });

  it('publishes the open request with each item state and the amount that is still available', async () => {
    const { app } = await start({
      sessions: [BUYER],
      listings: [AVAILABLE, UNPUBLISHED, SOLD, REPRICED],
      openRequest: true,
      contactPhone: PHONE,
      requestItems: [
        { listingId: AVAILABLE.listingId, title: AVAILABLE.title, priceCents: 125_000 },
        { listingId: UNPUBLISHED.listingId, title: UNPUBLISHED.title, priceCents: 45_000 },
        { listingId: SOLD.listingId, title: SOLD.title, priceCents: 90_000 },
        { listingId: REPRICED.listingId, title: REPRICED.title, priceCents: 125_000 },
        { listingId: null, title: 'Cama', priceCents: 50_000 },
      ],
    });

    try {
      const response = await fetch(`${app.baseUrl}${cartUrl()}`, {
        headers: bearer(BUYER.token),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        readonly cart: {
          readonly request: {
            readonly reference: string;
            readonly whatsappUrl: string | null;
            readonly totalCents: number;
            readonly hasChanges: boolean;
            readonly items: readonly {
              readonly title: string;
              readonly priceCents: number;
              readonly state: string;
              readonly currentPriceCents: number | null;
            }[];
          } | null;
        };
      };

      const request = payload.cart.request;
      expect(request).not.toBeNull();
      expect(request?.reference).toHaveLength(8);
      expect(request?.whatsappUrl).toContain(`https://wa.me/${PHONE}?text=`);
      expect(request?.items.map((item) => [item.title, item.state])).toEqual([
        ['Silla', 'current'],
        ['Ropero', 'unpublished'],
        ['Mesa', 'sold'],
        ['Sofá', 'price_changed'],
        ['Cama', 'deleted'],
      ]);

      // B9: la instantánea no se toca; el importe vigente descarta lo que ya no está disponible.
      expect(request?.items[1]?.priceCents).toBe(45_000);
      expect(request?.items[3]?.priceCents).toBe(125_000);
      expect(request?.items[3]?.currentPriceCents).toBe(REPRICED.priceCents);
      // Silla al precio de la instantánea y Sofá al precio de **hoy**; despublicado, vendido y eliminado
      // suman cero.
      expect(request?.totalCents).toBe(125_000 + 99_000);
      expect(request?.hasChanges).toBe(true);
    } finally {
      await app.close();
    }
  });
});

describe('cart request', () => {
  it('refuses an empty cart', async () => {
    const { app } = await start({ sessions: [BUYER], contactPhone: PHONE });

    try {
      const response = await fetch(`${app.baseUrl}${cartUrl()}/request`, {
        method: 'POST',
        headers: bearer(BUYER.token),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: 'cart_empty' });
    } finally {
      await app.close();
    }
  });

  it('refuses the request when the event has no WhatsApp configured', async () => {
    const { app } = await start({
      sessions: [BUYER],
      listings: [AVAILABLE],
      cartItems: [AVAILABLE.listingId],
    });

    try {
      const response = await fetch(`${app.baseUrl}${cartUrl()}/request`, {
        method: 'POST',
        headers: bearer(BUYER.token),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: 'whatsapp_not_configured' });
    } finally {
      await app.close();
    }
  });

  it('issues the request once and returns the same reference when retried', async () => {
    const { app, harness } = await start({
      sessions: [BUYER],
      listings: [AVAILABLE],
      cartItems: [AVAILABLE.listingId],
      contactPhone: PHONE,
    });

    try {
      const first = await fetch(`${app.baseUrl}${cartUrl()}/request`, {
        method: 'POST',
        headers: bearer(BUYER.token),
      });
      expect(first.status).toBe(201);

      const created = (await first.json()) as {
        readonly request: {
          readonly reference: string;
          readonly requestedAt: string;
          readonly whatsappUrl: string | null;
        };
      };
      expect(created.request.reference).toHaveLength(8);
      expect(created.request.whatsappUrl).toBe(
        `https://wa.me/${PHONE}?text=${encodeURIComponent(
          `Hola, quiero pedir estos artículos. Solicitud: ${created.request.reference}.`,
        )}`,
      );

      const second = await fetch(`${app.baseUrl}${cartUrl()}/request`, {
        method: 'POST',
        headers: bearer(BUYER.token),
      });
      expect(second.status).toBe(200);
      const repeated = (await second.json()) as {
        readonly request: { readonly reference: string };
      };
      expect(repeated.request.reference).toBe(created.request.reference);
      expect(harness.state.requests).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('answers the request with the same record the cart read publishes', async () => {
    const { app } = await start({
      sessions: [BUYER],
      listings: [AVAILABLE],
      cartItems: [AVAILABLE.listingId],
      contactPhone: PHONE,
    });

    try {
      const created = await fetch(`${app.baseUrl}${cartUrl()}/request`, {
        method: 'POST',
        headers: bearer(BUYER.token),
      });
      expect(created.status).toBe(201);
      const issued = (await created.json()) as {
        readonly request: {
          readonly reference: string;
          readonly totalCents: number;
          readonly hasChanges: boolean;
          readonly items: readonly {
            readonly title: string;
            readonly priceCents: number;
            readonly state: string;
            readonly currentPriceCents: number | null;
          }[];
        };
      };

      expect(issued.request.items).toEqual([
        {
          title: AVAILABLE.title,
          priceCents: AVAILABLE.priceCents,
          state: 'current',
          currentPriceCents: AVAILABLE.priceCents,
        },
      ]);
      expect(issued.request.totalCents).toBe(AVAILABLE.priceCents);
      expect(issued.request.hasChanges).toBe(false);

      // B9: la recarga publica exactamente lo mismo que el acto. El `POST` relee la solicitud con la
      // misma consulta del `GET`, así que el comprador no ve dos formas del mismo hecho.
      const read = await fetch(`${app.baseUrl}${cartUrl()}`, {
        headers: bearer(BUYER.token),
      });
      const payload = (await read.json()) as { readonly cart: { readonly request: unknown } };
      expect(payload.cart.request).toEqual(issued.request);
    } finally {
      await app.close();
    }
  });

  it('refuses a cart whose price was emptied after the article entered', async () => {
    const { app } = await start({
      sessions: [BUYER],
      listings: [UNPRICED],
      cartItems: [UNPRICED.listingId],
      contactPhone: PHONE,
    });

    try {
      const response = await fetch(`${app.baseUrl}${cartUrl()}/request`, {
        method: 'POST',
        headers: bearer(BUYER.token),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: 'price_missing' });
    } finally {
      await app.close();
    }
  });

  it('refuses a cart with an unpublished article', async () => {
    const { app } = await start({
      sessions: [BUYER],
      listings: [AVAILABLE, UNPUBLISHED],
      cartItems: [AVAILABLE.listingId, UNPUBLISHED.listingId],
      contactPhone: PHONE,
    });

    try {
      const response = await fetch(`${app.baseUrl}${cartUrl()}/request`, {
        method: 'POST',
        headers: bearer(BUYER.token),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: 'listing_not_published' });
    } finally {
      await app.close();
    }
  });

  it('refuses a cart with a sold article', async () => {
    const { app } = await start({
      sessions: [BUYER],
      listings: [AVAILABLE, SOLD],
      cartItems: [AVAILABLE.listingId, SOLD.listingId],
      contactPhone: PHONE,
    });

    try {
      const response = await fetch(`${app.baseUrl}${cartUrl()}/request`, {
        method: 'POST',
        headers: bearer(BUYER.token),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: 'listing_sold' });
    } finally {
      await app.close();
    }
  });

  it('lets the buyer cancel its open request', async () => {
    const { app, harness } = await start({
      sessions: [BUYER],
      listings: [AVAILABLE],
      cartItems: [AVAILABLE.listingId],
      openRequest: true,
      contactPhone: PHONE,
    });

    try {
      const response = await fetch(`${app.baseUrl}${cartUrl()}/request`, {
        method: 'DELETE',
        headers: bearer(BUYER.token),
      });

      expect(response.status).toBe(204);
      expect(harness.state.requests[0]?.cancelledAt).not.toBeNull();

      const read = await fetch(`${app.baseUrl}${cartUrl()}`, {
        headers: bearer(BUYER.token),
      });
      const payload = (await read.json()) as { readonly cart: { readonly request: unknown } };
      expect(payload.cart.request).toBeNull();
    } finally {
      await app.close();
    }
  });
});

describe('event WhatsApp contact', () => {
  const fixture: CartFixture = {
    sessions: [KING, DEVICE],
    administrator: { id: KING.userId, displayName: KING.displayName },
    memberUserId: KING.userId,
  };

  it('refuses a co-device with forbidden, not not_found', async () => {
    const { app } = await start(fixture);

    try {
      const response = await fetch(`${app.baseUrl}/events/${CART_EVENT_ID}/contact`, {
        headers: bearer(DEVICE.token),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    } finally {
      await app.close();
    }
  });

  it('reads, writes and clears the number for the event administrator', async () => {
    const { app } = await start(fixture);

    try {
      const empty = await fetch(`${app.baseUrl}/events/${CART_EVENT_ID}/contact`, {
        headers: bearer(KING.token),
      });
      expect(empty.status).toBe(200);
      await expect(empty.json()).resolves.toEqual({ contactPhone: null });

      const invalid = await fetch(`${app.baseUrl}/events/${CART_EVENT_ID}/contact`, {
        method: 'PATCH',
        headers: { ...bearer(KING.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactPhone: 'doce' }),
      });
      expect(invalid.status).toBe(400);

      const written = await fetch(`${app.baseUrl}/events/${CART_EVENT_ID}/contact`, {
        method: 'PATCH',
        headers: { ...bearer(KING.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactPhone: '+52 55 1234 5678' }),
      });
      expect(written.status).toBe(200);
      await expect(written.json()).resolves.toEqual({ contactPhone: PHONE });

      const cleared = await fetch(`${app.baseUrl}/events/${CART_EVENT_ID}/contact`, {
        method: 'PATCH',
        headers: { ...bearer(KING.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactPhone: null }),
      });
      expect(cleared.status).toBe(200);
      await expect(cleared.json()).resolves.toEqual({ contactPhone: null });
    } finally {
      await app.close();
    }
  });
});

describe('event cart requests', () => {
  const fixture: CartFixture = {
    sessions: [KING, DEVICE, BUYER],
    administrator: { id: KING.userId, displayName: KING.displayName },
    memberUserId: KING.userId,
    listings: [AVAILABLE],
    cartItems: [AVAILABLE.listingId],
    openRequest: true,
    contactPhone: PHONE,
  };

  type PanelPayload = {
    readonly requests: readonly {
      readonly reference: string;
      readonly buyerName: string;
      readonly itemCount: number;
      readonly totalCents: number;
      readonly hasChanges: boolean;
      readonly items: readonly {
        readonly title: string;
        readonly priceCents: number;
        readonly state: string;
        readonly currentPriceCents: number | null;
      }[];
    }[];
  };

  it('shows the request with the buyer name and the snapshot of what was asked', async () => {
    const { app } = await start(fixture);

    try {
      const response = await fetch(`${app.baseUrl}/events/${CART_EVENT_ID}/cart-requests`, {
        headers: bearer(KING.token),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as PanelPayload;

      expect(payload.requests).toHaveLength(1);
      expect(payload.requests[0]?.buyerName).toBe('Ana');
      expect(payload.requests[0]?.reference).toHaveLength(8);
      expect(payload.requests[0]?.itemCount).toBe(1);
      expect(payload.requests[0]?.totalCents).toBe(125_000);
      // B8: un artículo vigente no marca la solicitud como desactualizada.
      expect(payload.requests[0]?.hasChanges).toBe(false);
      expect(payload.requests[0]?.items[0]).toEqual({
        title: 'Silla',
        priceCents: 125_000,
        state: 'current',
        currentPriceCents: 125_000,
      });
    } finally {
      await app.close();
    }
  });

  it('marks each item whose current catalog state differs from the snapshot', async () => {
    const { app } = await start({
      ...fixture,
      listings: [AVAILABLE, UNPUBLISHED, SOLD, REPRICED],
      requestItems: [
        {
          listingId: AVAILABLE.listingId,
          title: AVAILABLE.title,
          priceCents: AVAILABLE.priceCents ?? 0,
        },
        { listingId: UNPUBLISHED.listingId, title: UNPUBLISHED.title, priceCents: 45_000 },
        { listingId: SOLD.listingId, title: SOLD.title, priceCents: 90_000 },
        { listingId: REPRICED.listingId, title: REPRICED.title, priceCents: 125_000 },
        { listingId: null, title: 'Cama', priceCents: 50_000 },
      ],
    });

    try {
      const response = await fetch(`${app.baseUrl}/events/${CART_EVENT_ID}/cart-requests`, {
        headers: bearer(KING.token),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as PanelPayload;
      const request = payload.requests[0];
      const items = request?.items ?? [];

      expect(items.map((item) => [item.title, item.state])).toEqual([
        ['Silla', 'current'],
        ['Ropero', 'unpublished'],
        ['Mesa', 'sold'],
        ['Sofá', 'price_changed'],
        ['Cama', 'deleted'],
      ]);
      // El precio de la instantánea no se toca; el actual se publica aparte.
      expect(items[3]?.priceCents).toBe(125_000);
      expect(items[3]?.currentPriceCents).toBe(99_000);
      expect(items[4]?.currentPriceCents).toBeNull();
      expect(request?.hasChanges).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('refuses the list to a co-device and dismisses idempotently for the administrator', async () => {
    const { app, harness } = await start(fixture);

    try {
      const refused = await fetch(`${app.baseUrl}/events/${CART_EVENT_ID}/cart-requests`, {
        headers: bearer(DEVICE.token),
      });
      expect(refused.status).toBe(403);

      const first = await fetch(
        `${app.baseUrl}/events/${CART_EVENT_ID}/cart-requests/${OPEN_REQUEST_ID}`,
        { method: 'DELETE', headers: bearer(KING.token) },
      );
      expect(first.status).toBe(204);
      expect(harness.state.requests[0]?.dismissedBy).toBe(KING.userId);

      const second = await fetch(
        `${app.baseUrl}/events/${CART_EVENT_ID}/cart-requests/${OPEN_REQUEST_ID}`,
        { method: 'DELETE', headers: bearer(KING.token) },
      );
      expect(second.status).toBe(204);

      const unknown = await fetch(
        `${app.baseUrl}/events/${CART_EVENT_ID}/cart-requests/99999999-9999-4999-8999-999999999999`,
        { method: 'DELETE', headers: bearer(KING.token) },
      );
      expect(unknown.status).toBe(404);
    } finally {
      await app.close();
    }
  });
});
