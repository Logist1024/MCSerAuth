import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import argon2 from 'argon2';
import type { AppEnv } from '../../config/env.js';
import type { DbService } from '../../db/db.service.js';
import { account, session, user, verification } from '../../db/schema/index.js';

/**
 * better-auth integration (T3: wired on the NestJS side).
 *
 * - SQLite via the Drizzle adapter; the four auth tables are declared in our
 *   Drizzle schema, so no `@better-auth/cli` generation step is required.
 * - Passwords use argon2id (project security baseline, not better-auth's
 *   default scrypt).
 * - `user.image` is mapped onto the existing `avatar_url` column.
 * - Cookies: Secure/HttpOnly/SameSite=Lax; Secure stays off for local http.
 */
export function createAuth(env: AppEnv, db: DbService) {
  return betterAuth({
    appName: 'MCSerAuth',
    baseURL: env.AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db.db, {
      provider: 'sqlite',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      password: {
        hash: (password: string) => argon2.hash(password, { type: argon2.argon2id }),
        verify: ({ hash, password }: { hash: string; password: string }) =>
          argon2.verify(hash, password),
      },
    },
    user: {
      modelName: 'user',
      fields: {
        image: 'avatarUrl',
      },
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'user', input: false },
        banned: { type: 'boolean', required: false, defaultValue: false, input: false },
        signature: { type: 'string', required: false },
      },
    },
    session: { modelName: 'session' },
    account: { modelName: 'account' },
    verification: { modelName: 'verification' },
    trustedOrigins: [env.APP_URL, env.AUTH_URL],
    advanced: {
      useSecureCookies: env.COOKIE_SECURE,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
