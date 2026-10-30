import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Tokens opacos del corte de identidad.
 *
 * El servidor emite el valor una sola vez y guarda únicamente su hash SHA-256: la base no conserva
 * ninguna credencial utilizable (`decisiones` §22). El token tiene 256 bits de entropía, así que un
 * hash rápido es suficiente y no hace falta un KDF de contraseña.
 */
export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Comparación en tiempo constante para credenciales de longitud arbitraria. */
export function constantTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
}

/** Extrae el token de `Authorization: Bearer <token>`; el esquema no distingue mayúsculas. */
export function bearerToken(authorization: string | undefined): string | null {
  if (authorization === undefined) {
    return null;
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}
