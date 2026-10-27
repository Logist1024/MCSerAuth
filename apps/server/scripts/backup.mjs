/**
 * Creates a consistent SQLite backup before migrations or refactors.
 *
 * Usage:
 *   pnpm db:backup                     -> data/backups/mcserauth-<timestamp>.db
 *   pnpm db:backup -- ./tmp/copy.db    -> explicit destination
 *
 * The WAL is checkpointed first, then better-sqlite3's online backup API
 * copies the database without blocking the running process for long.
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL ?? './data/mcserauth.db';
const databaseFile = path.resolve(process.cwd(), sqliteFilePath(databaseUrl));

const explicitTarget = process.argv.slice(2).find((arg) => arg !== '--');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const targetFile = path.resolve(
  process.cwd(),
  explicitTarget ?? path.join('data', 'backups', `mcserauth-${timestamp}.db`),
);

if (/^(?:mysql2?|postgres(?:ql)?):\/\//i.test(databaseUrl.trim())) {
  console.error(
    'pnpm db:backup only supports SQLite. Use mysqldump / pg_dump for MySQL or PostgreSQL.',
  );
  process.exitCode = 1;
} else if (!fs.existsSync(databaseFile)) {
  console.error(`Database not found: ${databaseFile}`);
  process.exitCode = 1;
} else if (path.resolve(targetFile) === path.resolve(databaseFile)) {
  console.error('Backup target must differ from the source database.');
  process.exitCode = 1;
} else {
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });

  const sqlite = new Database(databaseFile, { readonly: true });
  try {
    sqlite.pragma('wal_checkpoint(TRUNCATE)');
    await sqlite.backup(targetFile);
    console.log(`Backup written to ${targetFile}`);
  } finally {
    sqlite.close();
  }
}

/** Normalizes the SQLite URL forms accepted by DATABASE_URL into a file path. */
function sqliteFilePath(databaseUrl) {
  const value = databaseUrl.trim();
  if (value.startsWith('sqlite://')) {
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
