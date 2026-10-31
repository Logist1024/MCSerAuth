import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  buildBackupPlan,
  describeCommand,
  parseArgs,
  sqliteFilePath,
  sslArgsMySql,
  sslModePostgres,
} from '../scripts/backup.mjs';

const SCRIPT = path.resolve(process.cwd(), 'scripts/backup.mjs');

/**
 * `mysqldump` / `pg_dump` are not installed in this environment (and CI only has them
 * inside the service containers), so the spawn path is proven against stub binaries that
 * record how they were called. The stubs make the assertion runnable anywhere: what is
 * under test is our argument list, our environment passing, and our failure handling —
 * not the vendor tools.
 */
describe('backup plan', () => {
  it('routes each accepted URL scheme to one engine', () => {
    const cases: [string, string][] = [
      ['./data/mcserauth.db', 'sqlite'],
      ['file:./data/mcserauth.db', 'sqlite'],
      ['sqlite:./data/mcserauth.db', 'sqlite'],
      ['mysql://u:p@h/mcserauth', 'mysql'],
      ['mysql2://u:p@h/mcserauth', 'mysql'],
      ['postgres://u:p@h/mcserauth', 'postgres'],
      ['postgresql://u:p@h/mcserauth', 'postgres'],
    ];
    for (const [url, dialect] of cases) {
      expect(buildBackupPlan(url).dialect, url).toBe(dialect);
    }
  });

  it('keeps the SQLite artifact extension and points at the resolved source file', () => {
    const plan = buildBackupPlan('./data/mcserauth.db', { explicitTarget: './tmp/copy.db' });
    expect(plan.command).toBeNull();
    expect(plan.outputFile).toBe(path.resolve(process.cwd(), './tmp/copy.db'));
    expect(plan.sourceFile).toBe(path.resolve(process.cwd(), 'data/mcserauth.db'));
  });

  it('names server dumps .sql under data/backups by default', () => {
    const plan = buildBackupPlan('mysql://u:p@h/mcserauth', { stamp: 'STAMP' });
    expect(plan.outputFile).toBe(
      path.join(process.cwd(), 'data', 'backups', 'mcserauth-STAMP.sql'),
    );
  });

  it('rejects unknown schemes and server URLs without a database name', () => {
    expect(() => buildBackupPlan('mongodb://h/db')).toThrow(/Unsupported DATABASE_URL scheme/);
    expect(() => buildBackupPlan('postgres://u:p@h/')).toThrow(/must include a database name/);
  });

  it('passes MySQL flags that survive managed-MySQL restrictions and consistent charset', () => {
    const { args } = buildBackupPlan('mysql://u:p@db.example.com:3307/mcserauth');
    expect(args).toContain('--no-tablespaces');
    expect(args).toContain('--single-transaction');
    expect(args).toContain('--default-character-set=utf8mb4');
    expect(args).toContain('--port=3307');
    expect(args.at(-1)).toBe('mcserauth');
  });

  it('falls back to the default port per engine', () => {
    expect(buildBackupPlan('mysql://u:p@h/db').args).toContain('--port=3306');
    expect(buildBackupPlan('postgres://u:p@h/db').args).toContain('--port=5432');
  });

  it('dumps plain SQL without ownership clauses for PostgreSQL', () => {
    const { args } = buildBackupPlan('postgres://u:p@h/mcserauth');
    expect(args).toEqual(expect.arrayContaining(['--format=plain', '--no-owner', '--no-acl']));
    expect(args).toContain('--dbname=mcserauth');
  });

  it('never puts a credential in the argument vector', () => {
    for (const url of [
      'mysql://app:s3cr3t@h/mcserauth',
      'postgres://app:s3cr3t@h/mcserauth',
      'mysql://app:s%40w%23rd@h/mcserauth',
    ]) {
      const plan = buildBackupPlan(url);
      const password = decodeURIComponent(new URL(url.replace(/^mysql:/, 'mysql:')).password);
      expect(plan.args.join(' ')).not.toContain(password);
      expect(Object.values(plan.extraEnv)).toContain(password);
    }
  });

  it('decodes percent-encoded credentials before handing them to the client', () => {
    expect(buildBackupPlan('mysql://app:p%40ss%3Aword@h/db').extraEnv.MYSQL_PWD).toBe('p@ss:word');
    expect(buildBackupPlan('mysql://ap%70p:pw@h/db').args).toContain('--user=appp');
  });

  it('masks the account name in the dry-run rendering', () => {
    const rendered = describeCommand(buildBackupPlan('mysql://root:pw@h/db'));
    expect(rendered).toContain('--user=<user>');
    expect(rendered).not.toContain('root');
    expect(rendered).not.toContain('pw');
    expect(describeCommand(buildBackupPlan('sqlite:./a.db'))).toMatch(/online backup API/);
  });

  it('maps DB_SSL onto per-engine TLS options', () => {
    expect(sslArgsMySql(undefined)).toEqual([]);
    expect(sslArgsMySql('false')).toEqual([]);
    expect(sslArgsMySql('true')).toEqual(['--ssl-mode=REQUIRED']);
    expect(sslArgsMySql('1', '/etc/ca.pem')).toEqual([
      '--ssl-mode=VERIFY_IDENTITY',
      '--ssl-ca=/etc/ca.pem',
    ]);
    expect(sslModePostgres('true')).toBe('verify-full');
    expect(sslModePostgres('false')).toBe('disable');
    expect(sslModePostgres('')).toBe('prefer');
  });

  it('carries DB_SSL through the plan for both engines', () => {
    const env = { DB_SSL: 'true', DB_SSL_CA: '/etc/ca.pem' };
    expect(buildBackupPlan('mysql://u:p@h/db', { env }).args).toContain('--ssl-ca=/etc/ca.pem');
    expect(buildBackupPlan('postgres://u:p@h/db', { env }).extraEnv).toMatchObject({
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: '/etc/ca.pem',
    });
  });

  it('tolerates the literal -- that pnpm forwards before the real arguments', () => {
    expect(parseArgs(['--', '--dry-run'])).toEqual({ dryRun: true, explicitTarget: undefined });
    expect(parseArgs(['--', './tmp/x.db']).explicitTarget).toBe('./tmp/x.db');
    expect(parseArgs([]).dryRun).toBe(false);
  });

  it('normalizes every accepted SQLite URL form to a path', () => {
    expect(sqliteFilePath('./a.db')).toBe('./a.db');
    expect(sqliteFilePath('sqlite:./a.db')).toBe('./a.db');
    expect(sqliteFilePath('file:./a.db')).toBe('./a.db');
    expect(sqliteFilePath('sqlite:///?mode=memory')).toBe('/');
  });
});

describe('backup run against stub dump binaries', () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcserauth-backup-'));
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Writes an executable that records its argv/env and echoes a fixture payload. */
  function writeStub(name: string, exitCode: number) {
    const record = path.join(dir, `${name}.record`);
    const stub = path.join(dir, name);
    fs.writeFileSync(
      stub,
      [
        '#!/bin/sh',
        `printf '%s\\n' "$@" > "${record}"`,
        `printf 'MYSQL_PWD=%s\\n' "${'$'}{MYSQL_PWD-}" >> "${record}"`,
        `printf 'PGPASSWORD=%s\\n' "${'$'}{PGPASSWORD-}" >> "${record}"`,
        `printf 'PGSSLMODE=%s\\n' "${'$'}{PGSSLMODE-}" >> "${record}"`,
        'echo "-- fake dump payload --"',
        `exit ${exitCode}`,
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    return { stub, record };
  }

  function runBackup(databaseUrl: string, extraEnv: Record<string, string> = {}) {
    const output = path.join(dir, 'dump.sql');
    const result = spawnSync(process.execPath, [SCRIPT, output], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        DATABASE_URL: databaseUrl,
        ...extraEnv,
      },
    });
    return { result, output };
  }

  it('invokes mysqldump with an argument array, the password only via env', () => {
    const { record } = writeStub('mysqldump', 0);
    const { result, output } = runBackup('mysql://app:sup3rsecret@db.example.com:3306/mcserauth');

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(fs.readFileSync(output, 'utf8')).toContain('fake dump payload');

    const recorded = fs.readFileSync(record, 'utf8');
    // The stub records its argv first, then the env vars it was given.
    const argv = recorded
      .split('\n')
      .filter((line) => !/^[A-Z_]+=/.test(line))
      .join('\n');
    expect(argv).toContain('--single-transaction');
    expect(argv).toContain('mcserauth');
    expect(argv).not.toContain('sup3rsecret');
    expect(recorded).toContain('MYSQL_PWD=sup3rsecret');
    // The console output must not quote the connection string either.
    expect(result.stdout).toContain('Backup written to');
    expect(result.stdout).not.toContain('sup3rsecret');
  });

  it('invokes pg_dump and forwards the TLS level', () => {
    const { record } = writeStub('pg_dump', 0);
    const { result, output } = runBackup('postgres://app:pgsecret@db.example.com/mcserauth', {
      DB_SSL: 'true',
    });

    expect(result.status).toBe(0);
    expect(fs.existsSync(output)).toBe(true);
    const recorded = fs.readFileSync(record, 'utf8');
    expect(recorded).toContain('PGPASSWORD=pgsecret');
    expect(recorded).toContain('PGSSLMODE=verify-full');
    expect(recorded).toContain('--format=plain');
  });

  it('removes the partial dump and fails when the binary exits non-zero', () => {
    writeStub('mysqldump', 3);
    const { result, output } = runBackup('mysql://app:pw@h/mcserauth');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('exit code 3');
    expect(fs.existsSync(output)).toBe(false);
  });

  it('names the missing client package instead of a raw ENOENT', () => {
    // Its own empty directory as PATH: `dir` holds stub binaries from the cases above.
    const emptyBin = fs.mkdtempSync(path.join(os.tmpdir(), 'mcserauth-empty-path-'));
    const output = path.join(dir, 'absent.sql');
    const result = spawnSync(process.execPath, [SCRIPT, output], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: emptyBin,
        DATABASE_URL: 'mysql://app:pw@h/mcserauth',
      },
    });
    fs.rmSync(emptyBin, { recursive: true, force: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not found on PATH');
    expect(result.stderr).toContain('mysql-client');
    expect(fs.existsSync(output)).toBe(false);
  });

  it('dry-runs without creating the destination file', () => {
    writeStub('mysqldump', 0);
    const output = path.join(dir, 'never.sql');
    const result = spawnSync(process.execPath, [SCRIPT, output, '--dry-run'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        DATABASE_URL: 'mysql://app:pw@h/db',
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('engine:  mysql');
    expect(result.stdout).not.toContain('pw');
    expect(fs.existsSync(output)).toBe(false);
  });
});

describe('backup of a real SQLite database', () => {
  let dir: string;
  let source: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcserauth-sqlite-'));
    source = path.join(dir, 'src.db');
    const sqlite = new Database(source);
    sqlite.pragma('journal_mode = WAL');
    sqlite.exec('create table sample (id integer primary key, note text not null)');
    sqlite.prepare('insert into sample (note) values (?)').run('用户发布的帖子');
    sqlite.close();
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes a consistent copy that opens and keeps its rows', () => {
    const output = path.join(dir, 'copy.db');
    const result = spawnSync(process.execPath, [SCRIPT, output], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: source },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Backup written to');

    const copy = new Database(output, { readonly: true });
    try {
      expect(copy.prepare('select note from sample').get()).toEqual({ note: '用户发布的帖子' });
    } finally {
      copy.close();
    }
  });

  it('refuses to back a database up onto itself', () => {
    const result = spawnSync(process.execPath, [SCRIPT, source], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: source },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must differ');
  });

  it('reports a missing source database instead of writing an empty file', () => {
    const output = path.join(dir, 'from-missing.db');
    const result = spawnSync(process.execPath, [SCRIPT, output], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: path.join(dir, 'does-not-exist.db') },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Database not found');
    expect(fs.existsSync(output)).toBe(false);
  });
});
