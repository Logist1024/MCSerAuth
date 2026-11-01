import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import { createServerApp } from '../../src/http/server.factory.js';
import { user as userTable, verification as verificationTable } from '../../src/db/schema/index.js';
import { createTestContext, type TestContext } from './db.js';
import type { UserRole } from '@mcserauth/shared';

export interface E2eContext extends TestContext {
  app: NestExpressApplication;
  /** supertest bound to the production-identical HTTP server (ADR 0008). */
  request: () => request.SuperTest<request.Test>;
  close: () => Promise<void>;
}

/**
 * Boots the real HTTP assembly (src/http/server.factory.ts) on top of the
 * isolated per-file database from createTestContext(). One app per test file —
 * the chains inside share state on purpose.
 */
export async function createE2eContext(): Promise<E2eContext> {
  const ctx = await createTestContext();
  const app = await createServerApp();
  await app.init();
  return {
    ...ctx,
    app,
    request: () => request(app.getHttpServer()) as unknown as request.SuperTest<request.Test>,
    close: async () => {
      await app.close();
      await ctx.cleanup();
    },
  };
}

/** An authenticated site account: session cookie + the IP bucket it owns. */
export interface Actor {
  email: string;
  password: string;
  name: string;
  cookie: string;
  ip: string;
  userId: string;
}

let ipCounter = 0;

function nextIp(): string {
  ipCounter += 1;
  return `10.77.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

function cookieOf(response: request.Response): string {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : header !== undefined ? [header] : [];
  if (cookies.length === 0) {
    throw new Error(`no set-cookie in response (status ${response.status})`);
  }
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

/**
 * Full site-identity setup: sign up, consume the verification token straight
 * from the `verification` table (console mail provider logs it, the row is the
 * stable source), sign in, return the session cookie.
 */
export async function registerVerifiedUser(
  ctx: E2eContext,
  overrides: { email?: string; name?: string } = {},
): Promise<Actor> {
  const ip = nextIp();
  const email = overrides.email ?? `e2e-${randomBytes(6).toString('hex')}@test.local`;
  const password = 'e2e-Passw0rd!x';
  const name = overrides.name ?? `e2e${randomBytes(4).toString('hex')}`;

  const signUp = await ctx
    .request()
    .post('/api/auth/sign-up/email')
    .set('X-Forwarded-For', ip)
    .send({ email, password, name });
  if (signUp.status >= 300) {
    throw new Error(`sign-up failed (${signUp.status}): ${JSON.stringify(signUp.body)}`);
  }

  const token = (
    await ctx.db.db
      .select({ value: verificationTable.value })
      .from(verificationTable)
      .where(eq(verificationTable.identifier, email))
  )[0]?.value;
  if (token === undefined) {
    // better-auth did not persist a verification row in this version — flip
    // the flag directly, the same idiom test/password-reset.test.ts uses.
    await ctx.db.db
      .update(userTable)
      .set({ emailVerified: true })
      .where(eq(userTable.email, email));
  } else {
    await ctx.request().get('/api/auth/verify-email').query({ token }).set('X-Forwarded-For', ip);
  }

  const signIn = await ctx
    .request()
    .post('/api/auth/sign-in/email')
    .set('X-Forwarded-For', ip)
    .send({ email, password });
  if (signIn.status !== 200) {
    throw new Error(`sign-in failed (${signIn.status}): ${JSON.stringify(signIn.body)}`);
  }

  const userId = (
    await ctx.db.db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email))
  )[0]?.id;
  if (userId === undefined) {
    throw new Error(`no user row for ${email}`);
  }
  return { email, password, name, cookie: cookieOf(signIn), ip, userId };
}

/**
 * Role changes take effect on the next request — sessions re-read the user row
 * on every call, so no re-login is needed.
 */
export async function promoteToRole(ctx: E2eContext, actor: Actor, role: UserRole): Promise<void> {
  await ctx.db.db.update(userTable).set({ role }).where(eq(userTable.id, actor.userId));
}

/** A valid original-size texture as a PNG buffer. */
export async function pngBuffer(width = 64, height = 64): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 90, g: 160, b: 90, alpha: 1 } },
  })
    .png()
    .toBuffer();
}
