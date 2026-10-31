/**
 * Type surface for `backup.mjs`.
 *
 * The implementation stays plain JavaScript on purpose: `pnpm db:backup` must run on a
 * production box installed with `--prod`, where `tsx` (a devDependency, and what the other
 * scripts use) is not present. This file gives the test suite and any future TypeScript
 * caller the same signatures without changing that property.
 */

export type BackupDialect = 'sqlite' | 'mysql' | 'postgres';

export interface BackupPlan {
  dialect: BackupDialect;
  /** Absolute destination path; SQLite ends in `.db`, server dumps in `.sql`. */
  outputFile: string;
  /** Resolved source file, SQLite only. */
  sourceFile?: string;
  /** Dump binary to spawn; `null` for the SQLite online-backup API path. */
  command: string | null;
  args: string[];
  /** Credentials and TLS level, passed to the child process only — never on the command line. */
  extraEnv: Record<string, string>;
}

export interface BackupPlanOptions {
  stamp?: string;
  explicitTarget?: string;
  env?: Record<string, string | undefined>;
}

export function parseArgs(argv: string[]): { dryRun: boolean; explicitTarget?: string };
export function buildBackupPlan(url: string, options?: BackupPlanOptions): BackupPlan;
export function sslArgsMySql(dbSsl: string | undefined, sslCa?: string | undefined): string[];
export function sslModePostgres(dbSsl: string | undefined): 'verify-full' | 'disable' | 'prefer';
export function describeCommand(plan: BackupPlan): string;
export function sqliteFilePath(databaseUrl: string): string;
