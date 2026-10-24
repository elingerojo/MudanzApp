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
const portSchema = z.coerce.number().int().min(1).max(65_535);

export interface Config {
  readonly port: number;
  readonly nodeEnv: string;
  readonly databaseUrl: string | null;
  readonly appBaseUrl: string;
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

export const config: Config = {
  port: readPort(warnings),
  nodeEnv: readOptional('NODE_ENV') ?? 'development',
  databaseUrl,
  appBaseUrl: readOptional('APP_BASE_URL') ?? '',
  warnings,
};
