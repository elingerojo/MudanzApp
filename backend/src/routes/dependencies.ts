import type { AiDraftProvider } from '../ai/draft-provider.js';
import type { Database } from '../db.js';
import type { OAuthVerifier } from '../identity/oauth.js';
import type { ObjectStore } from '../storage/object-store.js';

/**
 * Dependencias de los cortes con sesión.
 *
 * Se inyectan desde el arranque: la base, la costura OAUTH, el reloj, la credencial de
 * administración, el almacén de objetos y el generador de borradores. Ningún router lee
 * `process.env` ni crea su propio reloj (`03` §3).
 */
export interface IdentityDeps {
  readonly database: Database;
  readonly oauth: OAuthVerifier;
  readonly now: () => Date;
  readonly adminToken: string | null;
  readonly storage: ObjectStore;
  readonly ai: AiDraftProvider;
}
