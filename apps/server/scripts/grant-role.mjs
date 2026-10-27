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
import Database from 'better-sqlite3';
import path from 'node:path';

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
const databaseFile = path.resolve(process.cwd(), databaseUrl);

const sqlite = new Database(databaseFile);
try {
  const result = sqlite.prepare('update user set role = ? where email = ?').run(role, email);
  if (result.changes === 0) {
    console.error(`No account found for ${email} (database: ${databaseFile})`);
    process.exitCode = 1;
  } else {
    console.log(`Granted role "${role}" to ${email} (database: ${databaseFile})`);
  }
} finally {
  sqlite.close();
}
