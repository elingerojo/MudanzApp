/**
 * Derivación pura de la URL de pruebas y de la dev branch.
 *
 * La URL de pruebas **se deriva** de `DATABASE_URL` (mismo rol, host, puerto y parámetros) y nunca
 * se transporta ni se imprime. La derivación `_test` es local-only; en remoto solo existe `_branch`.
 * Este módulo existe separado del runner para poder probarlo sin base de datos (`06-datos`,
 * `07-secretos`).
 */
export type DatabaseTarget = 'main' | 'test' | 'branch' | 'branch-test';

export interface TargetOptions {
  readonly branch: boolean;
  readonly test: boolean;
  readonly remote: boolean;
}

export interface DatabaseConnection {
  readonly target: DatabaseTarget;
  readonly databaseUrl: string;
}

/** Error de derivación: código estable y guía, sin valores de entorno. */
export class DatabaseUrlError extends Error {
  readonly code: string;

  constructor(code: string, guidance: string) {
    super(`${code}: ${guidance}`);
    this.name = 'DatabaseUrlError';
    this.code = code;
  }
}

export function parseTargetOptions(argv: readonly string[]): TargetOptions {
  return {
    branch: argv.includes('--branch'),
    test: argv.includes('--test'),
    remote: argv.includes('--remote'),
  };
}

export function resolveTarget(options: TargetOptions): DatabaseTarget {
  if (options.remote && options.test) {
    throw new DatabaseUrlError(
      'remote-test-target-rejected',
      'remote test databases do not exist; use --remote with --branch only',
    );
  }

  if (options.branch && options.test) {
    return 'branch-test';
  }

  if (options.branch) {
    return 'branch';
  }

  return options.test ? 'test' : 'main';
}

function stripEnvironmentSuffix(databaseName: string): string {
  if (databaseName.endsWith('_branch_test')) {
    return databaseName.slice(0, -'_branch_test'.length);
  }

  if (databaseName.endsWith('_branch')) {
    return databaseName.slice(0, -'_branch'.length);
  }

  if (databaseName.endsWith('_test')) {
    return databaseName.slice(0, -'_test'.length);
  }

  return databaseName;
}

/** Nombre de la base para un objetivo; nunca vuelve a sufijar una base que ya termina en `_test`. */
export function databaseNameFor(databaseName: string, target: DatabaseTarget): string {
  const base = stripEnvironmentSuffix(databaseName);

  switch (target) {
    case 'main':
      return base;
    case 'test':
      return `${base}_test`;
    case 'branch':
      return `${base}_branch`;
    case 'branch-test':
      return `${base}_branch_test`;
  }
}

export function deriveDatabaseUrl(source: string | undefined, target: DatabaseTarget): string {
  if (source === undefined || source.trim().length === 0) {
    throw new DatabaseUrlError(
      'database-url-missing',
      'DATABASE_URL is absent; add it to backend/.env.local (manual Man-2.4)',
    );
  }

  let url: URL;
  try {
    url = new URL(source.trim());
  } catch {
    throw new DatabaseUrlError('database-url-invalid', 'DATABASE_URL is not a valid URL');
  }

  const databaseName = url.pathname.replace(/^\//, '');
  if (databaseName.length === 0) {
    throw new DatabaseUrlError(
      'database-name-missing',
      'DATABASE_URL does not name a database; the derivation needs the current name',
    );
  }

  url.pathname = `/${databaseNameFor(databaseName, target)}`;
  return url.toString();
}

/**
 * Camino autorizado de lectura del entorno: lo usan solo los scripts que ya cargaron
 * `.env.local` con el soporte nativo de Node. Devuelve `null` (tras emitir la guía) en vez de
 * saltarse la corrida.
 */
export function resolveConnectionFromEnvironment(
  argv: readonly string[],
): DatabaseConnection | null {
  try {
    const target = resolveTarget(parseTargetOptions(argv));
    return { target, databaseUrl: deriveDatabaseUrl(process.env.DATABASE_URL, target) };
  } catch (error) {
    if (error instanceof DatabaseUrlError) {
      console.error(error.message);
      return null;
    }

    throw error;
  }
}
