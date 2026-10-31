import { z } from 'zod';

/**
 * Configuración tipada del backend.
 *
 * `process.env` se lee **una sola vez**, aquí, y nunca en otro módulo. Una variable vacía cuenta
 * como ausente. El módulo **no lanza al importar**: lo que no se puede resolver se registra en
 * `warnings` y el proceso lo emite al arrancar, de modo que el servidor sigue siendo inspeccionable
 * (`/health` responde siempre) sin filtrar valores.
 */

const DEFAULT_PORT = 3000;
const DEFAULT_OAUTH_MODE = 'live';
const DEFAULT_R2_MODE = 'live';
const portSchema = z.coerce.number().int().min(1).max(65_535);

/**
 * Modo de una integración tal como se declaró. La validez se comprueba en el adaptador, en la
 * primera petición que usa la capacidad: así el proceso sigue inspeccionable y el fallo es estable
 * (`00-stack` §Integraciones).
 */
export interface OAuthConfig {
  readonly mode: string;
  readonly issuer: string | null;
  readonly clientId: string | null;
  readonly clientSecret: string | null;
}

/**
 * Almacenamiento de objetos (`R2_MODE`). Solo las credenciales de esta integración: `R2_MODE`
 * gobierna estas y ninguna otra. En el ciclo 3a el lector existe porque la capacidad existe —la foto
 * del artículo—, pero solo el adaptador `fake` está implementado; `live` falla con un código estable
 * hasta el ciclo que apruebe el cliente S3.
 */
export interface StorageConfig {
  readonly mode: string;
  readonly bucket: string | null;
  readonly endpoint: string | null;
  readonly accessKeyId: string | null;
  readonly secretAccessKey: string | null;
}

export interface Config {
  readonly port: number;
  readonly nodeEnv: string;
  readonly databaseUrl: string | null;
  readonly appBaseUrl: string;
  readonly adminToken: string | null;
  readonly oauth: OAuthConfig;
  readonly storage: StorageConfig;
  readonly warnings: readonly string[];
}

function readOptional(name: string): string | null {
  const raw = process.env[name];
  if (raw === undefined) {
    return null;
  }

  const value = raw.trim();
  return value.length === 0 ? null : value;
}

function readPort(warnings: string[]): number {
  const raw = readOptional('PORT');
  if (raw === null) {
    return DEFAULT_PORT;
  }

  const parsed = portSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }

  warnings.push('PORT is not a valid port; using 3000');
  return DEFAULT_PORT;
}

const warnings: string[] = [];
const databaseUrl = readOptional('DATABASE_URL');
if (databaseUrl === null) {
  warnings.push('DATABASE_URL is absent; /health/db will report not-configured');
}

const adminToken = readOptional('ADMIN_TOKEN');
if (adminToken === null) {
  warnings.push('ADMIN_TOKEN is absent; admin routes will report admin_not_configured');
}

const oauth: OAuthConfig = {
  mode: readOptional('OAUTH_MODE') ?? DEFAULT_OAUTH_MODE,
  issuer: readOptional('OAUTH_ISSUER'),
  clientId: readOptional('OAUTH_CLIENT_ID'),
  clientSecret: readOptional('OAUTH_CLIENT_SECRET'),
};

// La integración OAUTH ya tiene lector (ciclo 1). No se imprime ningún valor: solo se avisa de lo
// que falta para que el primer fallo sea diagnosticable desde el arranque.
if (oauth.mode !== 'live' && oauth.mode !== 'fake') {
  warnings.push(
    'OAUTH_MODE is not live or fake; the first identity request will report oauth_mode_invalid',
  );
} else if (
  oauth.mode === 'live' &&
  (oauth.issuer === null || oauth.clientId === null || oauth.clientSecret === null)
) {
  warnings.push(
    'OAUTH_MODE is live but its configuration is incomplete; the first identity request will report oauth_not_configured',
  );
}

const storage: StorageConfig = {
  mode: readOptional('R2_MODE') ?? DEFAULT_R2_MODE,
  bucket: readOptional('R2_BUCKET'),
  endpoint: readOptional('R2_ENDPOINT'),
  accessKeyId: readOptional('R2_ACCESS_KEY_ID'),
  secretAccessKey: readOptional('R2_SECRET_ACCESS_KEY'),
};

// La capacidad de almacenamiento existe desde el ciclo 3a (`capture`). Se avisa de lo que falta para
// que el primer fallo sea diagnosticable desde el arranque, nunca imprimiendo un valor.
if (storage.mode !== 'live' && storage.mode !== 'fake') {
  warnings.push('R2_MODE is not live or fake; the first photo request will report r2_mode_invalid');
} else if (storage.mode === 'fake') {
  warnings.push(
    'R2_MODE is fake: photos are stored in the system temp directory and are neither durable nor shared',
  );
} else if (
  storage.bucket === null ||
  storage.endpoint === null ||
  storage.accessKeyId === null ||
  storage.secretAccessKey === null
) {
  warnings.push(
    'R2_MODE is live but its configuration is incomplete; the first photo request will report r2_not_configured',
  );
} else {
  warnings.push(
    'R2_MODE is live but the live adapter is not implemented yet; the first photo request will report r2_live_unavailable',
  );
}

export const config: Config = {
  port: readPort(warnings),
  nodeEnv: readOptional('NODE_ENV') ?? 'development',
  databaseUrl,
  appBaseUrl: readOptional('APP_BASE_URL') ?? '',
  adminToken,
  oauth,
  storage,
  warnings,
};
