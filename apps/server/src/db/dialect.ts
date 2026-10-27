import type { DatabaseDialect } from './schema/model.js';

export type { DatabaseDialect };

const DIALECTS: readonly DatabaseDialect[] = ['sqlite', 'mysql', 'postgres'];

export function isDatabaseDialect(value: string): value is DatabaseDialect {
  return (DIALECTS as readonly string[]).includes(value);
}

/**
 * Resolves the database dialect from `DATABASE_URL`.
 *
 * Accepted forms:
 *   ./data/mcserauth.db          -> sqlite (backwards compatible)
 *   file:./data/mcserauth.db     -> sqlite
 *   sqlite:./data/mcserauth.db   -> sqlite
 *   mysql://user:pass@host/db    -> mysql
 *   postgres://user:pass@host/db -> postgres
 *
 * `DB_DIALECT` is an optional explicit override. When it disagrees with a
 * recognized URL scheme we fail fast instead of silently connecting to the
 * wrong engine.
 */
export function detectDialect(databaseUrl: string, override?: string): DatabaseDialect {
  const url = databaseUrl.trim();
  if (url === '') {
    throw new Error('DATABASE_URL must not be empty.');
  }

  const scheme = url.includes('://') ? url.slice(0, url.indexOf('://')).toLowerCase() : null;
  let inferred: DatabaseDialect;
  if (scheme === 'mysql' || scheme === 'mysql2') {
    inferred = 'mysql';
  } else if (scheme === 'postgres' || scheme === 'postgresql') {
    inferred = 'postgres';
  } else if (scheme === null || scheme === 'sqlite' || scheme === 'file' || url === ':memory:') {
    inferred = 'sqlite';
  } else {
    throw new Error(
      `Unsupported DATABASE_URL scheme "${scheme}://". Use sqlite, mysql or postgres.`,
    );
  }

  if (override === undefined || override === '') {
    return inferred;
  }
  if (!isDatabaseDialect(override)) {
    throw new Error(`DB_DIALECT must be one of: ${DIALECTS.join(', ')}.`);
  }
  if (override !== inferred) {
    throw new Error(
      `DB_DIALECT=${override} conflicts with DATABASE_URL (detected ${inferred}). ` +
        'Fix the URL or remove DB_DIALECT.',
    );
  }
  return override;
}

/** Normalizes a SQLite URL/path into a value accepted by better-sqlite3. */
export function sqliteFilePath(databaseUrl: string): string {
  const value = databaseUrl.trim();
  if (value === ':memory:' || value === 'sqlite::memory:' || value === 'file::memory:') {
    return ':memory:';
  }
  if (value.startsWith('sqlite://')) {
    // sqlite:///abs/path -> /abs/path
    return new URL(value).pathname;
  }
  if (value.startsWith('sqlite:')) {
    return value.slice('sqlite:'.length);
  }
  if (value.startsWith('file://')) {
    return new URL(value).pathname;
  }
  if (value.startsWith('file:')) {
    return value.slice('file:'.length);
  }
  return value;
}

/** Hides the password portion of a database URL for logs and error messages. */
export function redactDatabaseUrl(databaseUrl: string): string {
  try {
    if (!databaseUrl.includes('://')) {
      return databaseUrl;
    }
    const url = new URL(databaseUrl);
    if (url.password !== '') {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return '<unparseable database url>';
  }
}
