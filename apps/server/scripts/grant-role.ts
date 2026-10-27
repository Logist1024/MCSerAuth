/**
 * Grants a role to an existing website account.
 *
 * Usage (from apps/server, or via the root script):
 *   pnpm admin:grant you@example.com superadmin
 *   pnpm admin:grant you@example.com admin
 *   pnpm admin:grant you@example.com reviewer
 *
 * This is the bootstrap path for the first superadmin; roles are otherwise
 * managed by the site admin backend and the key-protected root console.
 */
import 'dotenv/config';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createConnection } from 'mysql2/promise';
import { Client as PgClient } from 'pg';
import { detectDialect, sqliteFilePath } from '../src/db/dialect.js';

const [email, rawRole = 'superadmin'] = process.argv.slice(2);
const role = rawRole === 'mod' ? 'reviewer' : rawRole;
const allowed = ['user', 'reviewer', 'admin', 'superadmin'];

if (!email) {
  console.error('Usage: pnpm admin:grant <email> [user|reviewer|admin|superadmin]');
  process.exit(1);
}
if (!allowed.includes(role)) {
  console.error(`Invalid role "${role}". Allowed: ${allowed.join(', ')}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL ?? './data/mcserauth.db';
const dialect = detectDialect(databaseUrl, process.env.DB_DIALECT);

const changes = await grant(dialect, databaseUrl, email, role);

if (changes === 0) {
  console.error(`No account found for ${email} (${describeTarget(dialect, databaseUrl)})`);
  process.exitCode = 1;
} else {
  console.log(`Granted role "${role}" to ${email} (${describeTarget(dialect, databaseUrl)})`);
}

async function grant(
  dialect: ReturnType<typeof detectDialect>,
  url: string,
  accountEmail: string,
  accountRole: string,
): Promise<number> {
  if (dialect === 'sqlite') {
    const databaseFile = path.resolve(process.cwd(), sqliteFilePath(url));
    const sqlite = new Database(databaseFile);
    try {
      return sqlite
        .prepare('update user set role = ? where email = ?')
        .run(accountRole, accountEmail).changes;
    } finally {
      sqlite.close();
    }
  }

  if (dialect === 'mysql') {
    const connection = await createConnection(url.replace(/^mysql2:\/\//i, 'mysql://'));
    try {
      const [result] = await connection.query('update `user` set `role` = ? where `email` = ?', [
        accountRole,
        accountEmail,
      ]);
      return (result as { affectedRows?: number }).affectedRows ?? 0;
    } finally {
      await connection.end();
    }
  }

  const client = new PgClient({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query('update "user" set "role" = $1 where "email" = $2', [
      accountRole,
      accountEmail,
    ]);
    return result.rowCount ?? 0;
  } finally {
    await client.end();
  }
}

function describeTarget(dialect: ReturnType<typeof detectDialect>, url: string): string {
  if (dialect === 'sqlite') {
    return path.resolve(process.cwd(), sqliteFilePath(url));
  }
  try {
    const parsed = new URL(url.replace(/^mysql2:\/\//i, 'mysql://'));
    parsed.password = parsed.password === '' ? '' : '***';
    return parsed.toString();
  } catch {
    return '<unparseable database url>';
  }
}
