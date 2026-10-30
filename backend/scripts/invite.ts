/**
 * Script canónico de invitación (`decisiones` §11).
 *
 * Es un cliente delgado del API de administración: crea el evento si no se indica uno y emite una
 * invitación de un solo uso. Lee `backend/.env.local` con el soporte nativo de Node (lo aporta el
 * script npm), jamás imprime `ADMIN_TOKEN` ni la URL de la base, y emite solo el resultado que el
 * administrador necesita compartir.
 *
 * Uso:
 *   npm run invite -- --origin "Bogotá" --destination "Ciudad de México"
 *   npm run invite -- --event <uuid>
 *
 * Opcionales: `--currency MXN`, `--backend <url>`, `--base <url>` (base de la superficie privada).
 * Sin `--backend` se usa `BACKEND_PUBLIC_URL` y, en local, `http://localhost:PORT`.
 */
const DEFAULT_PORT = '3000';
const DEFAULT_FRONTEND_BASE = 'http://localhost:4200';

interface CreatedEventBody {
  readonly event: { readonly id: string };
}

interface CreatedInvitationBody {
  readonly id: string;
  readonly token: string;
  readonly expiresAt: string;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }

  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function firstOrigin(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }

  const [first] = raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);

  return first ?? null;
}

const adminToken = process.env.ADMIN_TOKEN?.trim() ?? '';
if (adminToken.length === 0) {
  fail(
    'invite-admin-token-missing: set ADMIN_TOKEN in backend/.env.local (names in backend/.env.example)',
  );
}

const backendUrl = (
  option('--backend') ??
  process.env.BACKEND_PUBLIC_URL?.trim() ??
  `http://localhost:${process.env.PORT?.trim() || DEFAULT_PORT}`
).replace(/\/+$/, '');

const frontendBase = (
  option('--base') ??
  firstOrigin(process.env.APP_BASE_URL) ??
  DEFAULT_FRONTEND_BASE
).replace(/\/+$/, '');

/** Lee del cuerpo solo el código estable de error; nunca imprime el cuerpo crudo. */
async function request(path: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${backendUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  } catch {
    fail('invite-network-failed: the backend did not answer; start it with npm run dev:api');
  }

  if (!response.ok) {
    let code = 'unknown';
    try {
      const body: unknown = await response.json();
      if (typeof body === 'object' && body !== null && 'error' in body) {
        const { error } = body as { error?: unknown };
        if (typeof error === 'string') {
          code = error;
        }
      }
    } catch {
      // Un cuerpo no-JSON no aporta un código; se conserva el estado HTTP como evidencia.
    }

    fail(`invite-request-failed: ${String(response.status)} ${code}`);
  }

  return response.json();
}

async function main(): Promise<void> {
  let eventId = option('--event');

  if (eventId === null) {
    const origin = option('--origin');
    const destination = option('--destination');
    if (origin === null || destination === null) {
      fail(
        'invite-event-args-missing: pass --event <uuid> or both --origin <city> and --destination <city>',
      );
    }

    const created = (await request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        originCity: origin,
        destinationCity: destination,
        currency: option('--currency') ?? 'MXN',
      }),
    })) as CreatedEventBody;

    eventId = created.event.id;
  }

  const invitation = (await request(`/admin/events/${eventId}/invitations`, {
    method: 'POST',
  })) as CreatedInvitationBody;

  // La invitación es la capacidad que el administrador comparte; no es un valor de entorno. El
  // token se emite una sola vez y la base solo guarda su hash.
  console.log(`event: ${eventId}`);
  console.log(`invitation: ${invitation.id}`);
  console.log(`token: ${invitation.token}`);
  console.log(`expires: ${invitation.expiresAt}`);
  console.log(
    `redeem: POST ${backendUrl}/auth/redeem with inviteToken and an account assertion; surface base ${frontendBase}`,
  );
}

await main();
