import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import type { AppEnv } from '../../config/env.js';
import type { DbService } from '../../db/db.service.js';
import {
  account,
  nicknameReservation,
  player,
  session,
  user,
  verification,
} from '../../db/schema/index.js';
import type { CaptchaService } from '../captcha/captcha.service.js';
import type { MailService } from '../mail/mail.service.js';
/**
 * better-auth integration (T3: wired on the NestJS side).
 *
 * - SQLite via the Drizzle adapter; the four auth tables are declared in our
 *   Drizzle schema, so no `@better-auth/cli` generation step is required.
 * - Passwords use argon2id (project security baseline, not better-auth's
 *   default scrypt).
 * - `user.image` is mapped onto the existing `avatar_url` column.
 * - Cookies: Secure/HttpOnly/SameSite=Lax; Secure stays off for local http.
 * - Email verification is mandatory: sign-up sends a verification mail via
 *   MailService and the account stays unverified (no session) until the
 *   `/verify-email` link is opened.
 */
export function createAuth(
  env: AppEnv,
  db: DbService,
  captcha: CaptchaService,
  mailer: MailService,
) {
  return betterAuth({
    appName: 'MCSerAuth',
    baseURL: env.AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db.db, {
      provider: db.dialect === 'postgres' ? 'pg' : db.dialect,
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // Forgot password lives at the `emailAndPassword` level in this
      // better-auth version: better-auth builds
      // `${baseURL}/reset-password/:token?callbackURL=<redirectTo>` and our
      // web `/reset-password` page picks the token from the redirect query.
      sendResetPassword: async ({
        user,
        url,
      }: {
        user: {
          email: string;
          name: string;
        };
        url: string;
      }) => {
        try {
          await mailer.sendPasswordResetEmail({ email: user.email, name: user.name, url });
        } catch (error) {
          // Delivery is best-effort for the same reason as verification mail.
          console.error('[auth] send reset-password email failed', error);
        }
      },
      resetPasswordTokenExpiresIn: 3600, // 1 hour, matches the mail copy.
      // A reset is how a locked-out owner takes the account back, so every
      // website session must die with the old password. Launcher tokens live
      // in `token` and are untouched, per the three-layer identity rule.
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: async (password: string) => await argon2.hash(password, { type: argon2.argon2id }),
        verify: async ({ hash, password }: { hash: string; password: string }) =>
          await argon2.verify(hash, password),
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // Opening the verify link signs the user in on the spot (callbackURL
      // points back to the web app's login view).
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        try {
          await mailer.sendVerificationEmail({ email: user.email, name: user.name, url });
        } catch (error) {
          // Mail hard-fails must never abort account creation; MailService
          // already falls back to console. Belt-and-braces guard here too.
          console.error('[auth] send verification email failed', error);
        }
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
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Browsers must solve the captcha before password sign-in/sign-up and
        // before requesting a reset mail (SMTP pivots are otherwise a cheap
        // mail-bomb vector). Launcher (Yggdrasil) auth never hits these paths.
        if (ctx.path === '/request-password-reset') {
          const result = await captcha.consumeToken(
            ctx.headers?.get('x-captcha-token') ?? undefined,
          );
          if (!result.ok) {
            throw new APIError('BAD_REQUEST', {
              message: result.reason ?? '请先完成人机验证',
            });
          }
          return;
        }
        if (ctx.path !== '/sign-in/email' && ctx.path !== '/sign-up/email') {
          if (ctx.path === '/update-user') {
            const nameError = forbidNameUpdate((ctx.body ?? {}) as Record<string, unknown>);
            if (nameError !== null) {
              throw new APIError('BAD_REQUEST', { message: nameError });
            }
          }
          return;
        }
        const result = await captcha.consumeToken(ctx.headers?.get('x-captcha-token') ?? undefined);
        if (!result.ok) {
          throw new APIError('BAD_REQUEST', {
            message: result.reason ?? '请先完成人机验证',
          });
        }
        if (ctx.path === '/sign-up/email') {
          const body = (ctx.body ?? {}) as Record<string, unknown>;
          const name = typeof body.name === 'string' ? body.name : '';
          const nameError = await assertDisplayNameAvailable(db, name);
          if (nameError !== '') {
            throw new APIError('BAD_REQUEST', { message: nameError });
          }
        }
      }),
    },
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
/** Same rule as the registration form: 2–32 characters after trimming. */
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 32;
/**
 * Display names must be unique across the platform: no other account (`user`
 * rows, case-insensitive), no existing game nickname and no active 30-day
 * reservation may claim the same name. Returns a reusable error message.
 */
async function assertDisplayNameAvailable(db: DbService, rawName: string): Promise<string> {
  const name = rawName.trim();
  const lowered = name.toLowerCase();
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    return `昵称需要 ${NAME_MIN_LENGTH}–${NAME_MAX_LENGTH} 个字符`;
  }
  const userTaken = (
    await db.db
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.name}) = ${lowered}`)
  )[0];
  if (userTaken) {
    return '该昵称已被其他账号使用';
  }
  const playerTaken = (
    await db.db
      .select({ uuid: player.uuid })
      .from(player)
      .where(sql`lower(${player.nickname}) = ${lowered}`)
  )[0];
  if (playerTaken) {
    return '该昵称已被游戏角色使用';
  }
  const reserved = (
    await db.db
      .select({ nickname: nicknameReservation.nickname })
      .from(nicknameReservation)
      .where(sql`lower(${nicknameReservation.nickname}) = ${lowered}`)
  )[0];
  if (reserved) {
    return '该昵称处于保留期，暂不可用';
  }
  return '';
}
/**
 * Registration-side mirror of the rename rule: the DB enforces `user.name`
 * uniqueness, so profile updates must not smuggle a name change. Names live
 * only at sign-up; renames happen on the player nickname with a cool-down.
 */
function forbidNameUpdate(rawBody: Record<string, unknown>): string | null {
  const hasName = typeof rawBody === 'object' && 'name' in rawBody;
  if (!hasName) {
    return null;
  }
  const name = rawBody['name'];
  if (typeof name === 'string' && name.length > 0) {
    return '昵称不可修改';
  }
  return null;
}
