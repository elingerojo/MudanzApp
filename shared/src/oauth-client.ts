import { oauthDiscoverySchema, type OAuthDiscovery } from './pkce.js';

/**
 * Mitad cliente del flujo OAuth, compartida por `frontend` y `shop` (ciclos 4c-1 y 4d).
 *
 * Aquí vive lo que no depende de Angular ni del DOM: la configuración pública del cliente, la
 * derivación del URI de vuelta, el descubrimiento de los endpoints del emisor y el canje del código
 * contra el backend —que es el único que guarda el secreto—. `fetch` entra por argumento, como en el
 * proveedor de IA del backend, para que `shared` compile sin tipos de DOM y la prueba use un doble.
 *
 * La composición de PKCE sigue en `pkce.ts`; este módulo no genera verificadores ni estados.
 */

export type OAuthClientMode = 'live' | 'fake';

export interface OAuthClientConfig {
  readonly mode: OAuthClientMode;
  readonly issuer: string;
  readonly clientId: string;
}

/** ¿Hay con qué iniciar el flujo? Una cadena vacía cuenta como ausente. */
export function oauthConfigured(config: OAuthClientConfig): boolean {
  return config.issuer.trim().length > 0 && config.clientId.trim().length > 0;
}

/**
 * URI de vuelta del proveedor: el origen desde el que corre la aplicación más la ruta pública del
 * callback. Se deriva del navegador y no del bundle para que no quede desfasado entre el dominio
 * desplegado y el valor compilado; el proveedor exige que esté registrado tal cual.
 */
export function oauthRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/auth/callback`;
}

/** Respuesta del `fetch` que este módulo necesita; no arrastra los tipos del DOM. */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface FetchInitLike {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

/** Superficie mínima de `fetch`: el navegador la cumple y la prueba la sustituye. */
export type FetchLike = (input: string, init?: FetchInitLike) => Promise<FetchResponseLike>;

/** Códigos que el cliente distingue; el resto de fallos se trata como indisponibilidad. */
export type OAuthClientFailure =
  'oauth_not_configured' | 'oauth_unavailable' | 'oauth_invalid_token';

export type OAuthClientResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly code: OAuthClientFailure };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Descubre los endpoints públicos del flujo. Un documento inválido falla ruidoso con
 * `oauth_unavailable`: no se adivina un emisor ni un endpoint.
 */
export async function discoverOAuth(
  issuer: string,
  fetchImpl: FetchLike,
): Promise<OAuthClientResult<OAuthDiscovery>> {
  const base = issuer.trim().replace(/\/+$/, '');
  if (base.length === 0) {
    return { ok: false, code: 'oauth_not_configured' };
  }

  let response: FetchResponseLike;
  try {
    response = await fetchImpl(`${base}/.well-known/openid-configuration`, {
      headers: { accept: 'application/json' },
    });
  } catch {
    return { ok: false, code: 'oauth_unavailable' };
  }

  if (!response.ok) {
    return { ok: false, code: 'oauth_unavailable' };
  }

  const body: unknown = await response.json().catch(() => null);
  const parsed = oauthDiscoverySchema.safeParse(body);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, code: 'oauth_unavailable' };
}

export interface CodeExchangeInput {
  readonly apiBaseUrl: string;
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
}

/** Código del borde acotado a los que este cliente sabe explicar; el resto es indisponibilidad. */
function failureCode(body: unknown): OAuthClientFailure {
  const candidate = isRecord(body) && typeof body.error === 'string' ? body.error : null;

  if (candidate === 'oauth_invalid_token' || candidate === 'oauth_not_configured') {
    return candidate;
  }

  return 'oauth_unavailable';
}

/**
 * Canje del código por el `id_token` ya verificado. El navegador entrega código y verificador al
 * backend, que es el único que puede autenticarse ante el proveedor; la respuesta se traduce por
 * **código**, nunca por el texto del borde.
 */
export async function exchangeAuthorizationCode(
  input: CodeExchangeInput,
  fetchImpl: FetchLike,
): Promise<OAuthClientResult<string>> {
  const base = input.apiBaseUrl.replace(/\/+$/, '');

  let response: FetchResponseLike;
  try {
    response = await fetchImpl(`${base}/auth/oauth/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        code: input.code,
        codeVerifier: input.codeVerifier,
        redirectUri: input.redirectUri,
      }),
    });
  } catch {
    return { ok: false, code: 'oauth_unavailable' };
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    return { ok: false, code: failureCode(body) };
  }

  const payload: unknown = await response.json().catch(() => null);
  const token =
    isRecord(payload) && typeof payload.oauthToken === 'string' ? payload.oauthToken : null;

  if (token === null || token.length === 0) {
    return { ok: false, code: 'oauth_invalid_token' };
  }

  return { ok: true, value: token };
}
