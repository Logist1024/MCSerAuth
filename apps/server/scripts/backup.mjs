/**
 * Creates a consistent database backup before migrations, upgrades or on a schedule.
 *
 * The engine is derived from `DATABASE_URL`, so one command works for all three
 * supported databases and the artifact always lands in the same place:
 *
 *   pnpm db:backup                                -> data/backups/mcserauth-<timestamp>.db
 *   DATABASE_URL=mysql://… pnpm db:backup          -> data/backups/mcserauth-<timestamp>.sql
 *   DATABASE_URL=postgres://… pnpm db:backup       -> data/backups/mcserauth-<timestamp>.sql
 *   pnpm db:backup -- ./tmp/copy.db                 -> explicit destination
 *   pnpm db:backup -- --dry-run                     -> print the redacted plan, touch nothing
 *
 * SQLite checkpoints the WAL and uses better-sqlite3's online backup API. MySQL and
 * PostgreSQL shell out to `mysqldump` / `pg_dump`. Credentials travel through
 * `MYSQL_PWD` / `PGPASSWORD` and never appear in the process command line, which any
 * local user can read via `ps`; the dump binary is spawned with an argument array and
 * its stdout is wired to the destination file descriptor, so nothing is shell-parsed.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * Splits `--dry-run` from an explicit destination path.
 *
 * `pnpm db:backup -- --dry-run` forwards a literal `--`, which must not be taken for
 * the destination; `copy-data` shipped with exactly that bug.
 */
export function parseArgs(argv) {
  const rest = [];
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--dry-run') dryRun = true;
    else rest.push(arg);
  }
  return { dryRun, explicitTarget: rest[0] };
}

/**
 * Resolves the engine, the dump command and the destination path.
 *
 * Pure apart from reading `DB_SSL*` from the environment: it never touches the
 * filesystem or the network, so the MySQL/PostgreSQL branches stay assertable without
 * a running database.
 */
export function buildBackupPlan(url, { stamp = 'manual', explicitTarget, env = process.env } = {}) {
  const dialect = dialectFromUrl(url);
  const outputFile = path.resolve(
    process.cwd(),
    explicitTarget ??
      path.join('data', 'backups', `mcserauth-${stamp}.${dialect === 'sqlite' ? 'db' : 'sql'}`),
  );

  if (dialect === 'sqlite') {
    return {
      dialect,
      outputFile,
      sourceFile: path.resolve(process.cwd(), sqliteFilePath(url)),
      command: null,
      args: [],
      extraEnv: {},
    };
  }

  const connection = readConnection(url);
  return dialect === 'mysql'
    ? {
        dialect,
        outputFile,
        command: 'mysqldump',
        args: [
          `--host=${connection.host}`,
          `--port=${connection.port}`,
          `--user=${connection.user}`,
          // Managed MySQL denies TABLESPACE metadata reads to non-admin accounts.
          '--no-tablespaces',
          '--single-transaction',
          '--routines',
          '--triggers',
          '--hex-blob',
          '--default-character-set=utf8mb4',
          ...sslArgsMySql(env.DB_SSL, env.DB_SSL_CA),
          connection.database,
        ],
        extraEnv: { MYSQL_PWD: connection.password },
      }
    : {
        dialect,
        outputFile,
        command: 'pg_dump',
        args: [
          `--host=${connection.host}`,
          `--port=${connection.port}`,
          `--username=${connection.user}`,
          `--dbname=${connection.database}`,
          '--format=plain',
          '--no-owner',
          '--no-acl',
        ],
        extraEnv: {
          PGPASSWORD: connection.password,
          PGSSLMODE: sslModePostgres(env.DB_SSL),
          ...(env.DB_SSL_CA ? { PGSSLROOTCERT: env.DB_SSL_CA } : {}),
        },
      };
}

/** MySQL client TLS flags: `DB_SSL=true` demands an encrypted connection. */
export function sslArgsMySql(dbSsl, sslCa) {
  if (!isTruthy(dbSsl)) return [];
  return sslCa ? ['--ssl-mode=VERIFY_IDENTITY', `--ssl-ca=${sslCa}`] : ['--ssl-mode=REQUIRED'];
}

/** PostgreSQL TLS level, matching the runtime driver's `DB_SSL` semantics. */
export function sslModePostgres(dbSsl) {
  if (isTruthy(dbSsl)) return 'verify-full';
  if (isFalsy(dbSsl)) return 'disable';
  return 'prefer';
}

/** Renders the plan for `--dry-run` with the account name masked; passwords are already in env. */
export function describeCommand(plan) {
  if (plan.dialect === 'sqlite') return '(better-sqlite3 online backup API)';
  const args = plan.args.map((arg) =>
    /^--(user|username)=/.test(arg) ? arg.replace(/=.*$/, '=<user>') : arg,
  );
  return [plan.command, ...args].join(' ');
}

/** Normalizes the SQLite URL forms accepted by `DATABASE_URL` into a file path. */
export function sqliteFilePath(databaseUrl) {
  const value = databaseUrl.trim();
  if (value.startsWith('sqlite://') || value.startsWith('file://')) {
    return new URL(value).pathname;
  }
  if (value.startsWith('sqlite:') || value.startsWith('file:')) {
    return value.slice(value.indexOf(':') + 1);
  }
  return value;
}

async function main() {
  const { dryRun, explicitTarget } = parseArgs(process.argv.slice(2));
  const url = (process.env.DATABASE_URL ?? './data/mcserauth.db').trim();
  const plan = buildBackupPlan(url, {
    stamp: new Date().toISOString().replace(/[:.]/g, '-'),
    explicitTarget,
  });

  if (dryRun) {
    console.log(`engine:  ${plan.dialect}`);
    console.log(`output:  ${plan.outputFile}`);
    console.log(`command: ${describeCommand(plan)}`);
    return;
  }

  if (plan.dialect === 'sqlite') {
    await backupSqlite(plan);
  } else {
    await executeBackup(plan);
  }
}

async function backupSqlite(plan) {
  if (!fs.existsSync(plan.sourceFile)) {
    console.error(`Database not found: ${plan.sourceFile}`);
    process.exitCode = 1;
    return;
  }
  if (plan.outputFile === plan.sourceFile) {
    console.error('Backup target must differ from the source database.');
    process.exitCode = 1;
    return;
  }

  const { default: Database } = await import('better-sqlite3');
  fs.mkdirSync(path.dirname(plan.outputFile), { recursive: true });
  const sqlite = new Database(plan.sourceFile, { readonly: true });
  try {
    sqlite.pragma('wal_checkpoint(TRUNCATE)');
    await sqlite.backup(plan.outputFile);
    reportResult(plan);
  } finally {
    sqlite.close();
  }
}

async function executeBackup(plan) {
  fs.mkdirSync(path.dirname(plan.outputFile), { recursive: true });
  const descriptor = fs.openSync(plan.outputFile, 'w');
  try {
    const exitCode = await run(plan, descriptor);
    if (exitCode === 0) {
      reportResult(plan);
    } else {
      throw new Error(`${plan.command} failed with exit code ${exitCode}`);
    }
  } catch (error) {
    fs.rmSync(plan.outputFile, { force: true });
    if (error?.code === 'ENOENT') {
      const hint =
        plan.dialect === 'mysql'
          ? 'Install the MySQL client (`mysql-client` / `mysql-community-client`).'
          : 'Install the PostgreSQL client (`postgresql-client-16`).';
      console.error(`${plan.command} not found on PATH. ${hint}`);
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
  } finally {
    fs.closeSync(descriptor);
  }
}

/** Spawns the dump binary with stdout wired to the destination file; resolves its exit code. */
function run(plan, descriptor) {
  return new Promise((resolve, reject) => {
    const child = spawn(plan.command, plan.args, {
      stdio: ['ignore', descriptor, 'inherit'],
      env: { ...process.env, ...plan.extraEnv },
    });
    child.on('error', reject);
    child.on('close', resolve);
  });
}

function reportResult(plan) {
  const bytes = fs.statSync(plan.outputFile).size;
  console.log(`Backup written to ${plan.outputFile} (${(bytes / 1024).toFixed(1)} KiB)`);
}

function dialectFromUrl(url) {
  const scheme = url.includes('://') ? url.slice(0, url.indexOf('://')).toLowerCase() : null;
  if (scheme === 'mysql' || scheme === 'mysql2') return 'mysql';
  if (scheme === 'postgres' || scheme === 'postgresql') return 'postgres';
  if (scheme === null || scheme === 'sqlite' || scheme === 'file') return 'sqlite';
  throw new Error(`Unsupported DATABASE_URL scheme "${scheme}://". Use sqlite, mysql or postgres.`);
}

function readConnection(url) {
  const parsed = new URL(url.replace(/^mysql2:\/\//i, 'mysql://'));
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error('DATABASE_URL must include a database name for MySQL / PostgreSQL backups.');
  }
  return {
    host: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'mysql:' ? '3306' : '5432'),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
  };
}

function isTruthy(value) {
  return ['true', '1'].includes((value ?? '').trim().toLowerCase());
}

function isFalsy(value) {
  return ['false', '0'].includes((value ?? '').trim().toLowerCase());
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
