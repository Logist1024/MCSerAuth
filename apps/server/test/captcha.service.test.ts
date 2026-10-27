import { BadRequestException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CaptchaService } from '../src/modules/captcha/captcha.service.js';
import { captchaChallenge, siteSetting, user } from '../src/db/schema/index.js';
import { createTestContext, type TestContext } from './helpers/db.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** Reads the arithmetic expression back out of the server-rendered SVG. */
function solve(svg: string): string {
  const match = />([^<]*?) = \?</.exec(svg);
  if (match === null) {
    throw new Error(`unparsable challenge svg: ${svg.slice(0, 120)}`);
  }
  const expression = (match[1] ?? '').replace(/−/g, '-').replace(/\s/g, '');
  const parts = /^(\d+)([+-])(\d+)$/.exec(expression);
  if (parts === null) {
    throw new Error(`unparsable expression: ${expression}`);
  }
  const [, leftRaw, operator, rightRaw] = parts;
  const result =
    operator === '+' ? Number(leftRaw) + Number(rightRaw) : Number(leftRaw) - Number(rightRaw);
  return String(result);
}

describe('CaptchaService', () => {
  let ctx: TestContext;
  let captcha: CaptchaService;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.db.insert(user).values({ id: 'actor', email: 'actor@example.com', name: 'Actor' }).run();
    captcha = new CaptchaService(ctx.db, ctx.config);
  });

  afterEach(() => {
    ctx.cleanup();
  });

  describe('when verification is off', () => {
    it('reports disabled and lets every auth request through', () => {
      expect(captcha.isEnabled()).toBe(false);
      expect(captcha.publicConfig()).toEqual({
        enabled: false,
        provider: 'builtin',
        siteKey: null,
      });
      expect(captcha.consumeToken(undefined)).toEqual({ ok: true });
    });

    it('refuses to mint a challenge', () => {
      expect(() => captcha.createChallenge()).toThrow(BadRequestException);
      expect(() => captcha.createChallenge()).toThrow('人机验证未启用');
    });

    it('refuses to verify an answer', async () => {
      await expect(captcha.verify({ id: 'x', answer: '1' })).rejects.toThrow('人机验证未启用');
    });
  });

  describe('settings', () => {
    it('enables the built-in provider without any credentials', () => {
      const settings = captcha.updateSettings('actor', { enabled: true });
      expect(settings).toEqual({
        enabled: true,
        provider: 'builtin',
        siteKey: null,
        secretSet: false,
      });
      expect(captcha.isEnabled()).toBe(true);
    });

    it('demands both credentials before enabling an external provider', () => {
      expect(() =>
        captcha.updateSettings('actor', { enabled: true, provider: 'turnstile', siteKey: 'k' }),
      ).toThrow('启用外部人机验证时必须填写 Secret');
      expect(() =>
        captcha.updateSettings('actor', { enabled: true, provider: 'hcaptcha', secret: 's' }),
      ).toThrow('启用外部人机验证时必须填写 Site Key');
      expect(captcha.isEnabled()).toBe(false);
    });

    it('rejects an unknown provider', () => {
      expect(() =>
        captcha.updateSettings('actor', {
          provider: 'recaptcha' as never,
          siteKey: 'k',
          secret: 's',
        }),
      ).toThrow('人机验证提供商不受支持');
    });

    it('stores the secret encrypted and never reads it back out', () => {
      captcha.updateSettings('actor', { enabled: true, provider: 'builtin', secret: 'top-secret' });
      const stored = ctx.db.db
        .select({ value: siteSetting.value })
        .from(siteSetting)
        .where(eq(siteSetting.key, 'captchaSecret'))
        .get();
      expect(stored?.value).toContain('enc:v1:');
      expect(stored?.value).not.toContain('top-secret');
      expect(captcha.adminSettings()).toEqual({
        enabled: true,
        provider: 'builtin',
        siteKey: null,
        secretSet: true,
      });
    });

    it('clears the secret with an empty string', () => {
      captcha.updateSettings('actor', { secret: 'top-secret' });
      captcha.updateSettings('actor', { secret: '' });
      expect(captcha.adminSettings().secretSet).toBe(false);
    });
  });

  describe('built-in challenge flow', () => {
    beforeEach(() => {
      captcha.updateSettings('actor', { enabled: true });
    });

    it('issues a one-shot token tied to the challenge', async () => {
      const challenge = captcha.createChallenge();
      expect(challenge.id).toMatch(/^[0-9a-f]{36}$/);
      expect(challenge.svg).toContain('<svg');

      const verified = await captcha.verify({ id: challenge.id, answer: solve(challenge.svg) });
      expect(verified.token.split('.')).toHaveLength(3);
      expect(captcha.consumeToken(verified.token)).toEqual({ ok: true });
    });

    it('rejects an empty or unknown answer without consuming the challenge', async () => {
      const challenge = captcha.createChallenge();
      await expect(captcha.verify({ id: challenge.id, answer: '' })).rejects.toThrow(
        '请填写人机验证答案',
      );
      await expect(captcha.verify({ id: 'nope', answer: '1' })).rejects.toThrow(
        '验证码已过期，请刷新',
      );
      await expect(captcha.verify({ id: challenge.id, answer: '99999' })).rejects.toThrow(
        '验证码不正确',
      );
      // Still solvable afterwards.
      const retried = await captcha.verify({ id: challenge.id, answer: solve(challenge.svg) });
      expect(retried.token.split('.')).toHaveLength(3);
    });

    it('locks a challenge after too many wrong attempts', async () => {
      const challenge = captcha.createChallenge();
      const answer = solve(challenge.svg);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await expect(
          captcha.verify({ id: challenge.id, answer: String(Number(answer) + 7) }),
        ).rejects.toThrow('验证码不正确');
      }
      // The correct answer no longer helps; a fresh challenge is required.
      await expect(captcha.verify({ id: challenge.id, answer })).rejects.toThrow(
        '尝试次数过多，请刷新验证码',
      );
    });

    it('cannot be reused, even with a valid signed token', async () => {
      const challenge = captcha.createChallenge();
      const verified = await captcha.verify({ id: challenge.id, answer: solve(challenge.svg) });

      await expect(
        captcha.verify({ id: challenge.id, answer: solve(challenge.svg) }),
      ).rejects.toThrow('验证码已使用，请刷新');
      expect(captcha.consumeToken(verified.token)).toEqual({ ok: true });
      expect(captcha.consumeToken(verified.token).ok).toBe(false);
      expect(captcha.consumeToken(verified.token).reason).toBe('人机验证已使用，请重新验证');
    });

    it('refuses an expired challenge', async () => {
      const challenge = captcha.createChallenge();
      ctx.db.db
        .update(captchaChallenge)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(captchaChallenge.id, challenge.id))
        .run();
      await expect(
        captcha.verify({ id: challenge.id, answer: solve(challenge.svg) }),
      ).rejects.toThrow('验证码已过期，请刷新');
    });
  });

  describe('token integrity', () => {
    it('ignores malformed and tampered tokens', async () => {
      captcha.updateSettings('actor', { enabled: true });
      expect(captcha.consumeToken(undefined).reason).toBe('请先完成人机验证');
      expect(captcha.consumeToken('   ').reason).toBe('请先完成人机验证');
      expect(captcha.consumeToken('abc').reason).toBe('人机验证令牌无效，请重新验证');
      expect(captcha.consumeToken('a.b').reason).toBe('人机验证令牌无效，请重新验证');

      const challenge = captcha.createChallenge();
      const verified = await captcha.verify({ id: challenge.id, answer: solve(challenge.svg) });
      const [id, expires] = verified.token.split('.');
      expect(captcha.consumeToken(`${id}.${expires}.deadbeef`).reason).toBe(
        '人机验证令牌无效，请重新验证',
      );
      expect(captcha.consumeToken(`${id}.1.${verified.token.split('.')[2]}`).reason).toBe(
        '人机验证已过期，请重新验证',
      );
    });

    it('refuses a token whose challenge row disappeared', async () => {
      captcha.updateSettings('actor', { enabled: true });
      const challenge = captcha.createChallenge();
      const verified = await captcha.verify({ id: challenge.id, answer: solve(challenge.svg) });
      ctx.db.db.delete(captchaChallenge).where(eq(captchaChallenge.id, challenge.id)).run();
      expect(captcha.consumeToken(verified.token).reason).toBe('请先完成人机验证');
    });
  });

  describe('external providers', () => {
    it('requires a widget token and never mints a local challenge', async () => {
      captcha.updateSettings('actor', {
        enabled: true,
        provider: 'turnstile',
        siteKey: 'sitekey',
        secret: 'placeholder',
      });
      await expect(captcha.verify({})).rejects.toThrow('缺少人机验证令牌');
      expect(() => captcha.createChallenge()).toThrow('当前人机验证由第三方组件完成，无需本地挑战');
    });
  });
});
