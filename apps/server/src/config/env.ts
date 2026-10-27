import { z } from 'zod';
import { detectDialect } from '../db/dialect.js';

/**
 * Environment contract for the server process.
 *
 * Everything is validated once at boot; a bad env aborts startup with a
 * readable error instead of failing later at runtime. Defaults are chosen so
 * that a fresh clone can run `pnpm dev` without copying `.env`.
 */

const DEV_AUTH_SECRET = 'dev-only-insecure-secret-change-me-please-32';

const booleanFromEnv = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

const portFromEnv = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.coerce.number().int().min(1).max(65535).default(587),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Public site origin (T2: site domain and auth domain are configured separately). */
  APP_URL: z.string().url().default('http://localhost:3000'),
  /** Public auth-service origin that launchers talk to. */
  AUTH_URL: z.string().url().default('http://localhost:8000'),

  /** Production must be true; enforced below. */
  COOKIE_SECURE: booleanFromEnv.default(false),

  BETTER_AUTH_SECRET: z.string().min(32).optional(),

  /** Launcher access-token lifetime (seconds); planning default is 30 days. */
  OAUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(2_592_000),
  /** Absolute refresh-token lifetime measured from the initial authorization. */
  OAUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).default(5_184_000),
  /** Authorization-code lifetime (seconds); codes are also single-use. */
  OAUTH_AUTH_CODE_TTL_SECONDS: z.coerce.number().int().min(30).max(3_600).default(300),

  /** How long a joinServer registration stays usable by hasJoined (seconds). */
  SESSION_JOIN_TTL_SECONDS: z.coerce.number().int().min(30).max(3_600).default(300),
  /** Lifetime of signed texture URLs handed to launchers/game servers. */
  TEXTURE_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(86_400).default(300),

  /**
   * Database connection.
   *
   *   ./data/mcserauth.db           SQLite (default, zero-config local dev)
   *   sqlite:./data/mcserauth.db    SQLite (explicit)
   *   mysql://user:pass@host/db     MySQL 8.0+
   *   postgres://user:pass@host/db  PostgreSQL 16+
   *
   * Relative SQLite paths resolve from apps/server.
   */
  DATABASE_URL: z.string().min(1).default('./data/mcserauth.db'),
  /** Optional explicit dialect; must agree with the DATABASE_URL scheme when both are set. */
  DB_DIALECT: z.enum(['sqlite', 'mysql', 'postgres']).optional(),
  /** Server-database connection pool bounds (ignored by SQLite). */
  DB_POOL_MIN: z.coerce.number().int().min(0).max(100).default(0),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(500).default(10_000),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().min(500).default(30_000),
  /** Require TLS for MySQL/PostgreSQL connections. */
  DB_SSL: booleanFromEnv.default(false),
  /** Local texture/attachment directory (M2); relative paths resolve from apps/server. */
  UPLOAD_DIR: z.string().min(1).default('./data/uploads'),

  /** T4: mail is placeholder-only in M0, no sender is implemented. */
  MAIL_PROVIDER: z.enum(['console', 'smtp', 'resend']).default('console'),
  MAIL_FROM: z.string().email().default('no-reply@example.com'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: portFromEnv,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  /**
   * Root console: a separate key-only login used to manage superadmins and
   * site-wide configuration. The console is disabled when the key is absent.
   */
  CONSOLE_KEY: z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z.string().min(16).optional(),
  ),
  CONSOLE_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(28_800),
});

export type ParsedEnv = z.infer<typeof envSchema>;
export type AppEnv = Omit<ParsedEnv, 'BETTER_AUTH_SECRET'> & { BETTER_AUTH_SECRET: string };

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

/**
 * Parses and cross-validates the environment. Used both by @nestjs/config
 * (`validate`) and by AppConfigService, so the two views can never diverge.
 */
export function validateEnv(input: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${formatIssues(result.error)}`);
  }

  const env = result.data;

  if (env.DB_POOL_MIN > env.DB_POOL_MAX) {
    throw new Error('DB_POOL_MIN must be less than or equal to DB_POOL_MAX.');
  }
  try {
    detectDialect(env.DATABASE_URL, env.DB_DIALECT);
  } catch (error) {
    throw new Error(
      `Invalid database configuration: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const secret =
    env.BETTER_AUTH_SECRET ?? (env.NODE_ENV === 'production' ? undefined : DEV_AUTH_SECRET);

  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is required in production (>= 32 characters).');
  }
  if (env.NODE_ENV === 'production' && secret === DEV_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET must not use the development default in production.');
  }
  if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE must be true in production (Secure/HttpOnly/SameSite=Lax).');
  }

  return { ...env, BETTER_AUTH_SECRET: secret };
}
