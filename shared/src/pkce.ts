import { z } from 'zod';

/**
 * Mitad cliente del flujo de identidad con PKCE (ciclo 4c, `oauth-login`; decisión §37).
 *
 * El co-dispositivo pide su sesión de cuenta al proveedor desde el navegador: genera un verificador,
 * envía su `challenge` en la redirección y canjea el código con el verificador. El backend sigue
 * siendo el que verifica el `id_token` contra el JWKS del emisor
 * ([`oauth-live.ts`](../backend/src/identity/oauth-live.ts:59)); este módulo no guarda ni emite
 * sesiones.
 *
 * Vive en `shared` y no en `frontend` porque `shop` necesita el mismo flujo en 4d: una sola
 * implementación para los dos orígenes públicos del producto.
 *
 * Sin `btoa` ni `Buffer`: la codificación base64url se escribe aquí para que el navegador y la prueba
 * de Node produzcan exactamente la misma cadena. El azar entra por argumento, así que el núcleo es
 * determinista en la prueba y el navegador usa `crypto.getRandomValues` por defecto.
 */

/** Bytes del verificador. 32 bytes dan 43 caracteres base64url, el mínimo que exige la RFC 7636. */
export const PKCE_VERIFIER_BYTES = 32;

/** Bytes del `state`: el noce que ata la redirección a esta visita. */
export const OAUTH_STATE_BYTES = 32;

/** Alcances que se piden al proveedor: identidad y nombre visible, nada más. */
export const OAUTH_SCOPE = 'openid profile';

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** El alfabeto del verificador que admite la RFC 7636, como comprobación de forma. */
const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

/** Rellena los bytes que recibe. En el navegador es `crypto.getRandomValues`; en la prueba, un doble. */
export type RandomSource = (bytes: Uint8Array) => void;

/**
 * Superficie mínima de `crypto` que este módulo necesita. Se declara en vez de depender de los tipos
 * de `DOM` o de `node:crypto`, porque `shared` se compila para los dos runtimes.
 */
interface WebCryptoLike {
  readonly subtle: { digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer> };
  getRandomValues(bytes: Uint8Array): Uint8Array;
}

function webCrypto(): WebCryptoLike {
  const candidate = (globalThis as { crypto?: WebCryptoLike }).crypto;
  if (candidate === undefined) {
    // Falla ruidoso: sin azar del sistema no hay PKCE, y adivinarlo abriría el flujo a un ataque.
    throw new Error('web-crypto-unavailable');
  }

  return candidate;
}

const systemRandom: RandomSource = (bytes) => {
  webCrypto().getRandomValues(bytes);
};

/** Base64url sin relleno, que es la forma que exige la RFC 7636. */
export function base64Url(bytes: Uint8Array): string {
  let encoded = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const triplet = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    encoded += BASE64URL_ALPHABET[(triplet >> 18) & 63];
    encoded += BASE64URL_ALPHABET[(triplet >> 12) & 63];
    if (second !== undefined) {
      encoded += BASE64URL_ALPHABET[(triplet >> 6) & 63];
    }
    if (third !== undefined) {
      encoded += BASE64URL_ALPHABET[triplet & 63];
    }
  }

  return encoded;
}

function randomUrlSafe(length: number, random: RandomSource): string {
  const bytes = new Uint8Array(length);
  random(bytes);
  return base64Url(bytes);
}

/** Verificador del flujo: secreto de una sola visita, nunca se persiste más que en `sessionStorage`. */
export function createCodeVerifier(random: RandomSource = systemRandom): string {
  return randomUrlSafe(PKCE_VERIFIER_BYTES, random);
}

/** `state` de la redirección: ata la respuesta del proveedor a la visita que la inició. */
export function createOAuthState(random: RandomSource = systemRandom): string {
  return randomUrlSafe(OAUTH_STATE_BYTES, random);
}

/** ¿Es un verificador con la forma de la RFC? Es la comprobación que la prueba usa y el flujo no adivina. */
export function isPkceVerifier(value: string): boolean {
  return VERIFIER_PATTERN.test(value);
}

/**
 * Bytes ASCII de un texto. La RFC 7636 hashea el verificador como ASCII y el alfabeto del verificador
 * lo garantiza; sin `TextEncoder` —que `shared` no tiene, porque compila sin `DOM`— se escribe aquí.
 */
function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }

  return bytes;
}

/**
 * `code_challenge`: base64url del SHA-256 del verificador en ASCII (`S256`). Es el único método que se
 * declara; `plain` no se admite. Un verificador fuera de la forma de la RFC no se hashea: falla.
 */
export async function codeChallengeS256(verifier: string): Promise<string> {
  if (!isPkceVerifier(verifier)) {
    throw new Error('pkce-verifier-invalid');
  }

  const digest = await webCrypto().subtle.digest('SHA-256', asciiBytes(verifier));

  return base64Url(new Uint8Array(digest));
}

export interface AuthorizeUrlInput {
  readonly authorizationEndpoint: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly state: string;
  readonly scope?: string;
}

/** Compone `clave=valor` con la codificación estándar y sin depender de `URLSearchParams`. */
function queryString(entries: readonly (readonly [string, string])[]): string {
  return entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * URL de la pantalla del proveedor. Cada valor se codifica con `encodeURIComponent`, que es el
 * estándar de JavaScript y no depende del runtime.
 */
export function authorizeUrl(input: AuthorizeUrlInput): string {
  const query = queryString([
    ['response_type', 'code'],
    ['client_id', input.clientId],
    ['redirect_uri', input.redirectUri],
    ['scope', input.scope ?? OAUTH_SCOPE],
    ['code_challenge', input.codeChallenge],
    ['code_challenge_method', 'S256'],
    ['state', input.state],
  ]);
  const separator = input.authorizationEndpoint.includes('?') ? '&' : '?';

  return `${input.authorizationEndpoint}${separator}${query}`;
}

export interface TokenRequestInput {
  readonly code: string;
  readonly codeVerifier: string;
  readonly clientId: string;
  readonly redirectUri: string;
  /**
   * Solo existe en el canje de **servidor**. El navegador nunca lo lleva: un secreto ahí dejaría de
   * serlo. Google no admite clientes públicos en su `token_endpoint`
   * (`token_endpoint_auth_methods_supported` sin `none`), así que su canje vive en el backend
   * (`plan-ciclo-4c` §16).
   */
  readonly clientSecret?: string;
}

/**
 * Cuerpo del canje del código, ya codificado para `application/x-www-form-urlencoded`.
 *
 * El mismo compositor sirve a las dos mitades del flujo: sin secreto es un cliente público y con
 * secreto es el canal trasero del backend. La diferencia queda escrita aquí y no en dos cadenas
 * paralelas que se separan con el tiempo.
 */
export function tokenRequestBody(input: TokenRequestInput): string {
  const entries: [string, string][] = [
    ['grant_type', 'authorization_code'],
    ['code', input.code],
    ['code_verifier', input.codeVerifier],
    ['client_id', input.clientId],
    ['redirect_uri', input.redirectUri],
  ];

  if (input.clientSecret !== undefined && input.clientSecret.length > 0) {
    entries.push(['client_secret', input.clientSecret]);
  }

  return queryString(entries);
}

/**
 * Documento de descubrimiento del emisor, validado en la frontera (regla del `stack` §9): de aquí
 * salen los dos endpoints del flujo y no se acepta ninguna otra forma.
 */
export const oauthDiscoverySchema = z.object({
  issuer: z.url().optional(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
});

export type OAuthDiscovery = z.infer<typeof oauthDiscoverySchema>;

/** Respuesta del canje: al navegador solo le interesa el `id_token`, que es lo que el backend verifica. */
export const oauthTokenResponseSchema = z.object({
  id_token: z.string().trim().min(1),
});

export type OAuthTokenResponse = z.infer<typeof oauthTokenResponseSchema>;

/**
 * ¿La respuesta del proveedor corresponde a esta visita? Se comparan el `state` guardado y el
 * devuelto; una respuesta sin `state` o con otro no se canjea.
 */
export function oauthStateMatches(expected: string, received: string | null): boolean {
  if (received === null) {
    return false;
  }

  if (expected.length === 0 || received.length !== expected.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }

  return difference === 0;
}
