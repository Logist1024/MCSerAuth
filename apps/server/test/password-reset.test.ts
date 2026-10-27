import { eq } from 'drizzle-orm';
import type { Auth } from '../src/modules/auth/auth.instance.js';
import { createAuth } from '../src/modules/auth/auth.instance.js';
import { CaptchaService } from '../src/modules/captcha/captcha.service.js';
import type { MailService } from '../src/modules/mail/mail.service.js';
import { session, siteSetting, user } from '../src/db/schema/index.js';
import { createTestContext, type TestContext } from './helpers/db.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const API = 'http://localhost:8000';
const WEB = 'http://localhost:3000';

interface SentMail {
  email: string;
  url: string;
}

/** Drives the same `/api/auth/*` paths `main.ts` mounts, over a fake mailer. */
function setup(ctx: TestContext): { auth: Auth; mail: SentMail[] } {
  const mail: SentMail[] = [];
  const mailer = {
    sendPasswordResetEmail: async (payload: { email: string; url: string }) => {
      mail.push({ email: payload.email, url: payload.url });
    },
    sendVerificationEmail: async () => {},
  } as unknown as MailService;
  const auth = createAuth(ctx.config.env, ctx.db, new CaptchaService(ctx.db, ctx.config), mailer);
  return { auth, mail };
}

async function call(auth: Auth, path: string, init: RequestInit = {}) {
  const response = await auth.handler(
    new Request(`${API}${path}`, {
      ...init,
      headers: {
        Origin: WEB,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(init.headers as Record<string, string> | undefined),
      },
    }),
  );
  const text = await response.text();
  return { status: response.status, location: response.headers.get('location'), text };
}

async function signUp(auth: Auth, email: string, name: string, password: string) {
  const created = await call(auth, '/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ email, name, password }),
  });
  expect(created.status).toBe(200);
  const id = (JSON.parse(created.text) as { user: { id: string } }).user.id;
  // The verification link from the fake mailer is treated as already opened.
  return id;
}

function markVerified(ctx: TestContext, id: string): void {
  ctx.db.db.update(user).set({ emailVerified: true }).where(eq(user.id, id)).run();
}

function enableCaptcha(ctx: TestContext): void {
  ctx.db.db
    .insert(siteSetting)
    .values({ key: 'captchaEnabled', value: JSON.stringify(true) })
    .run();
}

/** better-auth builds `/reset-password/<token>?callbackURL=…`. */
function tokenFromMailUrl(url: string): string {
  const segment = new URL(url).pathname.split('/').pop() ?? '';
  return decodeURIComponent(segment);
}

describe('password reset (找回/重置密码)', () => {
  let ctx: TestContext;
  let auth: Auth;
  let mail: SentMail[];

  beforeEach(() => {
    ctx = createTestContext();
    ({ auth, mail } = setup(ctx));
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('serves the endpoint the web form posts to and hands the token back', async () => {
    await signUp(auth, 'a@example.com', 'ResetA', 'OldPass12345');

    const requested = await call(auth, '/api/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@example.com', redirectTo: `${WEB}/reset-password` }),
    });
    expect(requested.status).toBe(200);
    expect(mail).toHaveLength(1);

    const resetUrl = new URL(mail[0]!.url);
    const landed = await call(auth, `${resetUrl.pathname}${resetUrl.search}`);
    expect(landed.status).toBe(302);
    const callback = new URL(landed.location!);
    expect(callback.origin).toBe(WEB);
    expect(callback.pathname).toBe('/reset-password');
    expect(callback.searchParams.get('token')).toBe(tokenFromMailUrl(mail[0]!.url));
    expect(callback.searchParams.get('error')).toBeNull();
  });

  it('answers 404 for the pre-1.7 path so a rename can never pass silently', async () => {
    const stale = await call(auth, '/api/auth/forget-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@example.com' }),
    });
    expect(stale.status).toBe(404);
    expect(mail).toHaveLength(0);
  });

  it('sets the new password once and rejects the old one', async () => {
    const id = await signUp(auth, 'b@example.com', 'ResetB', 'OldPass12345');
    markVerified(ctx, id);
    await call(auth, '/api/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: 'b@example.com', redirectTo: `${WEB}/reset-password` }),
    });
    const token = tokenFromMailUrl(mail[0]!.url);

    const reset = await call(auth, '/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: 'NewPass12345' }),
    });
    expect(reset.status).toBe(200);

    const reused = await call(auth, '/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: 'ThirdPass12345' }),
    });
    expect(reused.status).toBe(400);
    expect(JSON.parse(reused.text).code).toBe('INVALID_TOKEN');

    const stalePassword = await call(auth, '/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'b@example.com', password: 'OldPass12345' }),
    });
    expect(stalePassword.status).toBe(401);

    const freshPassword = await call(auth, '/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'b@example.com', password: 'NewPass12345' }),
    });
    expect(freshPassword.status).toBe(200);
  });

  it('revokes the website sessions that were open on the old password', async () => {
    const id = await signUp(auth, 'c@example.com', 'ResetC', 'OldPass12345');
    markVerified(ctx, id);
    const signedIn = await call(auth, '/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'c@example.com', password: 'OldPass12345' }),
    });
    expect(signedIn.status).toBe(200);
    expect(ctx.db.db.select().from(session).where(eq(session.userId, id)).all()).toHaveLength(1);

    await call(auth, '/api/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: 'c@example.com', redirectTo: `${WEB}/reset-password` }),
    });
    const reset = await call(auth, '/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: tokenFromMailUrl(mail[0]!.url), newPassword: 'NewPass12345' }),
    });
    expect(reset.status).toBe(200);
    expect(ctx.db.db.select().from(session).where(eq(session.userId, id)).all()).toHaveLength(0);
  });

  it('stays silent about unknown addresses and sends them no mail', async () => {
    const requested = await call(auth, '/api/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: 'ghost@example.com', redirectTo: `${WEB}/reset-password` }),
    });
    expect(requested.status).toBe(200);
    expect(mail).toHaveLength(0);
  });

  it('refuses to send a reset mail without a captcha token', async () => {
    await signUp(auth, 'd@example.com', 'ResetD', 'OldPass12345');
    enableCaptcha(ctx);

    const requested = await call(auth, '/api/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: 'd@example.com', redirectTo: `${WEB}/reset-password` }),
    });
    expect(requested.status).toBe(400);
    expect(requested.text).toContain('请先完成人机验证');
    expect(mail).toHaveLength(0);
  });
});
