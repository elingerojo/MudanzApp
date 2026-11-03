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
const DEFAULT_AI_MODE = 'live';
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
 * gobierna estas y ninguna otra.
 *
 * Desde el ciclo 3c (`publish`) la capacidad incluye la **lectura pública** de la foto, así que su
 * modo forma parte de la integración (decisión §26): `live` exige las cinco piezas —bucket, endpoint,
 * las dos claves y la base pública— y `fake` no las usa, porque el doble compone su propia base.
 */
export interface StorageConfig {
  readonly mode: string;
  readonly bucket: string | null;
  readonly endpoint: string | null;
  readonly accessKeyId: string | null;
  readonly secretAccessKey: string | null;
  readonly publicBaseUrl: string | null;
}

/**
 * Generación de la ficha borrador (`AI_MODE`, ciclo 3d).
 *
 * Gobierna **solo** las credenciales de esta integración: el modelo se parametriza porque el
 * proveedor los retira, y la clave no sale del proceso. El host del proveedor **no** es una variable:
 * es un hecho del proveedor y vive en el adaptador `live` (`decisiones` §34).
 */
export interface AiConfig {
  readonly mode: string;
  readonly model: string | null;
  readonly apiKey: string | null;
}

export interface Config {
  readonly port: number;
  readonly nodeEnv: string;
  readonly databaseUrl: string | null;
  readonly appBaseUrl: string;
  readonly adminToken: string | null;
  readonly oauth: OAuthConfig;
  readonly storage: StorageConfig;
  readonly ai: AiConfig;
  readonly warnings: readonly string[];
}

/**
 * Avisos de la integración de identidad sobre la configuración **ya leída** (ciclos 1 y 4c-3).
 *
 * Es una función pura a propósito: el orden de sus ramas es el contrato del arranque —un modo
 * inválido manda sobre cualquier otra cosa, después el doble determinista y por último la
 * credencial que falta— y así se prueba sin reimportar el módulo ni tocar `process.env`.
 *
 * El `fake` advierte igual que R2 y AI (ciclo 4c-3): un despliegue que resuelve cuentas con el doble
 * no llama a ningún proveedor, y sin esta señal el único indicio sería el nombre que el doble
 * atribuye al sujeto.
 */
export function oauthWarnings(oauth: OAuthConfig): string[] {
  if (oauth.mode !== 'live' && oauth.mode !== 'fake') {
    return [
      'OAUTH_MODE is not live or fake; the first identity request will report oauth_mode_invalid',
    ];
  }

  if (oauth.mode === 'fake') {
    return [
      'OAUTH_MODE is fake: accounts come from a deterministic double and no identity provider is called',
    ];
  }

  if (oauth.issuer === null || oauth.clientId === null || oauth.clientSecret === null) {
    return [
      'OAUTH_MODE is live but its configuration is incomplete; the first identity request will report oauth_not_configured',
    ];
  }

  return [];
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
warnings.push(...oauthWarnings(oauth));

const storage: StorageConfig = {
  mode: readOptional('R2_MODE') ?? DEFAULT_R2_MODE,
  bucket: readOptional('R2_BUCKET'),
  endpoint: readOptional('R2_ENDPOINT'),
  accessKeyId: readOptional('R2_ACCESS_KEY_ID'),
  secretAccessKey: readOptional('R2_SECRET_ACCESS_KEY'),
  publicBaseUrl: readOptional('R2_PUBLIC_BASE_URL'),
};

// La capacidad de almacenamiento existe desde el ciclo 3a (`capture`) y su lectura pública desde 3c
// (`publish`). Se avisa de lo que falta para que el primer fallo sea diagnosticable desde el
// arranque, nunca imprimiendo un valor.
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
  storage.secretAccessKey === null ||
  storage.publicBaseUrl === null
) {
  warnings.push(
    'R2_MODE is live but its configuration is incomplete; the first photo request will report r2_not_configured',
  );
}

// La capacidad de borrador existe desde el ciclo 3d. Se avisa de lo que falta sin imprimir ningún
// valor, con el mismo patrón que OAUTH y R2: el primer fallo tiene que ser diagnosticable al arrancar.
const ai: AiConfig = {
  mode: readOptional('AI_MODE') ?? DEFAULT_AI_MODE,
  model: readOptional('AI_MODEL'),
  apiKey: readOptional('AI_API_KEY'),
};

if (ai.mode !== 'live' && ai.mode !== 'fake') {
  warnings.push('AI_MODE is not live or fake; the first draft request will report ai_mode_invalid');
} else if (ai.mode === 'fake') {
  warnings.push(
    'AI_MODE is fake: drafts come from a deterministic double and no provider is called',
  );
} else if (ai.model === null || ai.apiKey === null) {
  warnings.push(
    'AI_MODE is live but its configuration is incomplete; the first draft request will report ai_not_configured',
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
  ai,
  warnings,
};
