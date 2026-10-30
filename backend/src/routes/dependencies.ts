import type { Database } from '../db.js';
import type { OAuthVerifier } from '../identity/oauth.js';

/**
 * Dependencias del corte de identidad.
 *
 * Se inyectan desde el arranque: la base, la costura OAUTH, el reloj y la credencial de
 * administración. Ningún router lee `process.env` ni crea su propio reloj (`03` §3).
 */
export interface IdentityDeps {
  readonly database: Database;
  readonly oauth: OAuthVerifier;
  readonly now: () => Date;
  readonly adminToken: string | null;
}
