import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CAPTCHA_PROVIDERS,
  type CaptchaChallengeResponse,
  type CaptchaProvider,
  type CaptchaPublicConfig,
  type CaptchaSettings,
  type CaptchaVerifyRequest,
  type CaptchaVerifyResponse,
  type UpdateCaptchaSettingsRequest,
} from '@mcserauth/shared';
import { eq } from 'drizzle-orm';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service.js';
import { decryptSiteSecret, encryptSiteSecret } from '../../common/crypto/site-secret.js';
import { DbService } from '../../db/db.service.js';
import { captchaChallenge, moderationLog, siteSetting } from '../../db/schema/index.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const HCAPTCHA_URL = 'https://hcaptcha.com/siteverify';

interface StoredCaptchaConfig {
  enabled: boolean;
  provider: CaptchaProvider;
  siteKey: string | null;
  secret: string | null;
}

export interface CaptchaTokenCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Pluggable human verification.
 *
 * - `builtin`: offline SVG arithmetic challenge stored server-side.
 * - `turnstile` / `hcaptcha`: renderer-side widget verified against the
 *   provider's siteverify endpoint.
 *
 * A successful verification issues a short-lived HMAC token that better-auth
 * consumes exactly once on sign-in/sign-up. Launcher (Yggdrasil) logins are
 * intentionally exempt because launchers cannot render a captcha.
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(
    private readonly db: DbService,
    private readonly config: AppConfigService,
  ) {}

  publicConfig(): CaptchaPublicConfig {
    const settings = this.readSettings();
    return {
      enabled: settings.enabled,
      provider: settings.provider,
      siteKey: settings.siteKey,
    };
  }

  adminSettings(): CaptchaSettings {
    const settings = this.readSettings();
    return {
      enabled: settings.enabled,
      provider: settings.provider,
      siteKey: settings.siteKey,
      secretSet: settings.secret !== null && settings.secret !== '',
    };
  }

  isEnabled(): boolean {
    return this.readSettings().enabled;
  }

  updateSettings(actorId: string | null, input: UpdateCaptchaSettingsRequest): CaptchaSettings {
    const current = this.readSettings();
    const provider = input.provider ?? current.provider;
    if (!(CAPTCHA_PROVIDERS as readonly string[]).includes(provider)) {
      throw new BadRequestException('人机验证提供商不受支持');
    }
    const enabled = input.enabled ?? current.enabled;
    const siteKey = input.siteKey === undefined ? current.siteKey : (input.siteKey?.trim() ?? null);
    let secret = current.secret;
    if (input.secret !== undefined) {
      secret = input.secret === null || input.secret.trim() === '' ? null : input.secret.trim();
    }
    if (enabled && provider !== 'builtin') {
      if (siteKey === null || siteKey === '') {
        throw new BadRequestException('启用外部人机验证时必须填写 Site Key');
      }
      if (secret === null || secret === '') {
        throw new BadRequestException('启用外部人机验证时必须填写 Secret');
      }
    }

    const changes = new Map<string, string>([
      ['captchaEnabled', JSON.stringify(enabled)],
      ['captchaProvider', JSON.stringify(provider)],
      ['captchaSiteKey', JSON.stringify(siteKey === '' ? null : siteKey)],
    ]);
    if (input.secret !== undefined) {
      changes.set(
        'captchaSecret',
        JSON.stringify(
          secret === null ? '' : encryptSiteSecret(secret, this.config.betterAuthSecret),
        ),
      );
    }

    this.db.db.transaction((tx) => {
      for (const [key, value] of changes) {
        tx.insert(siteSetting)
          .values({ key, value, updatedBy: actorId })
          .onConflictDoUpdate({
            target: siteSetting.key,
            set: { value, updatedAt: new Date(), updatedBy: actorId },
          })
          .run();
      }
      tx.insert(moderationLog)
        .values({
          actorId,
          action: 'update_site',
          targetType: 'site',
          targetId: 'captcha',
          reason: `enabled=${enabled} provider=${provider}`,
        })
        .run();
    });

    return this.adminSettings();
  }

  createChallenge(): CaptchaChallengeResponse {
    const settings = this.readSettings();
    if (!settings.enabled) {
      throw new BadRequestException('人机验证未启用');
    }
    if (settings.provider !== 'builtin') {
      throw new BadRequestException('当前人机验证由第三方组件完成，无需本地挑战');
    }

    const left = 2 + Math.floor(Math.random() * 18);
    const right = 1 + Math.floor(Math.random() * 9);
    const plus = Math.random() > 0.35;
    const first = plus ? left : left + right;
    const second = plus ? right : right;
    const answer = plus ? first + second : first - second;
    const id = randomBytes(18).toString('hex');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    const answerHash = this.hashAnswer(id, String(answer));

    this.db.db
      .insert(captchaChallenge)
      .values({ id, answerHash, provider: settings.provider, expiresAt })
      .run();

    return {
      id,
      svg: renderArithmeticSvg(plus ? `${first} + ${second}` : `${first} − ${second}`),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verify(input: CaptchaVerifyRequest, ip?: string): Promise<CaptchaVerifyResponse> {
    const settings = this.readSettings();
    if (!settings.enabled) {
      throw new BadRequestException('人机验证未启用');
    }

    if (settings.provider === 'builtin') {
      const id = input.id?.trim() ?? '';
      const answer = input.answer?.trim() ?? '';
      if (id === '' || answer === '') {
        throw new BadRequestException('请填写人机验证答案');
      }
      const row = this.db.db
        .select()
        .from(captchaChallenge)
        .where(eq(captchaChallenge.id, id))
        .get();
      if (!row || row.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('验证码已过期，请刷新');
      }
      if (row.verifiedAt !== null) {
        throw new BadRequestException('验证码已使用，请刷新');
      }
      if (row.attempts >= MAX_ATTEMPTS) {
        throw new BadRequestException('尝试次数过多，请刷新验证码');
      }
      if (!this.matches(row.answerHash, this.hashAnswer(id, answer))) {
        this.db.db
          .update(captchaChallenge)
          .set({ attempts: row.attempts + 1 })
          .where(eq(captchaChallenge.id, id))
          .run();
        throw new BadRequestException('验证码不正确');
      }
      this.db.db
        .update(captchaChallenge)
        .set({ verifiedAt: new Date() })
        .where(eq(captchaChallenge.id, id))
        .run();
      return this.issueToken(id);
    }

    const widgetToken = input.token?.trim() ?? '';
    if (widgetToken === '') {
      throw new BadRequestException('缺少人机验证令牌');
    }
    if (settings.secret === null || settings.secret === '') {
      throw new BadRequestException('人机验证 Secret 未配置');
    }
    const passed = await this.verifyExternal(settings.provider, settings.secret, widgetToken, ip);
    if (!passed) {
      throw new BadRequestException('人机验证未通过，请重试');
    }
    const id = randomBytes(18).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    this.db.db
      .insert(captchaChallenge)
      .values({
        id,
        answerHash: '',
        provider: settings.provider,
        expiresAt,
        verifiedAt: new Date(),
      })
      .run();
    return this.issueToken(id, expiresAt);
  }

  /**
   * Consumes an auth captcha token. Returns `{ok:true}` when verification is
   * disabled so callers stay simple.
   */
  consumeToken(token: string | undefined): CaptchaTokenCheck {
    if (!this.isEnabled()) {
      return { ok: true };
    }
    if (token === undefined || token.trim() === '') {
      return { ok: false, reason: '请先完成人机验证' };
    }
    const parts = token.trim().split('.');
    if (parts.length !== 3) {
      return { ok: false, reason: '人机验证令牌无效，请重新验证' };
    }
    const [id, expiresRaw, signature] = parts as [string, string, string];
    const expires = Number(expiresRaw);
    if (!Number.isFinite(expires) || expires <= Date.now()) {
      return { ok: false, reason: '人机验证已过期，请重新验证' };
    }
    if (!this.matches(this.signToken(id, expires), signature)) {
      return { ok: false, reason: '人机验证令牌无效，请重新验证' };
    }
    const row = this.db.db.select().from(captchaChallenge).where(eq(captchaChallenge.id, id)).get();
    if (!row || row.verifiedAt === null) {
      return { ok: false, reason: '请先完成人机验证' };
    }
    if (row.tokenUsedAt !== null) {
      return { ok: false, reason: '人机验证已使用，请重新验证' };
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: '人机验证已过期，请重新验证' };
    }
    this.db.db
      .update(captchaChallenge)
      .set({ tokenUsedAt: new Date() })
      .where(eq(captchaChallenge.id, id))
      .run();
    return { ok: true };
  }

  // ------------------------------------------------------------------ helpers

  private readSettings(): StoredCaptchaConfig {
    const rows = this.db.db.select().from(siteSetting).all();
    const values = new Map<string, unknown>();
    for (const row of rows) {
      try {
        values.set(row.key, JSON.parse(row.value) as unknown);
      } catch {
        values.set(row.key, row.value);
      }
    }
    const providerValue = values.get('captchaProvider');
    const provider = (CAPTCHA_PROVIDERS as readonly string[]).includes(String(providerValue))
      ? (providerValue as CaptchaProvider)
      : 'builtin';
    const enabledValue = values.get('captchaEnabled');
    const enabled = typeof enabledValue === 'boolean' ? enabledValue : this.config.isProduction;
    const siteKeyValue = values.get('captchaSiteKey');
    const siteKey =
      typeof siteKeyValue === 'string' && siteKeyValue.trim() !== '' ? siteKeyValue : null;
    const secretValue = values.get('captchaSecret');
    const secret =
      typeof secretValue === 'string' && secretValue.startsWith('enc:v1:')
        ? decryptSiteSecret(secretValue, this.config.betterAuthSecret)
        : null;
    return { enabled, provider, siteKey, secret };
  }

  private hashAnswer(id: string, answer: string): string {
    return createHmac('sha256', this.config.betterAuthSecret)
      .update(`${id}:${answer.trim().toLowerCase()}`)
      .digest('hex');
  }

  private signToken(id: string, expires: number): string {
    return createHmac('sha256', this.config.betterAuthSecret)
      .update(`${id}.${expires}`)
      .digest('base64url');
  }

  private issueToken(
    id: string,
    expiresAt = new Date(Date.now() + TOKEN_TTL_MS),
  ): CaptchaVerifyResponse {
    const expires = expiresAt.getTime();
    return {
      token: `${id}.${expires}.${this.signToken(id, expires)}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private matches(expected: string, actual: string): boolean {
    const left = Buffer.from(expected, 'utf8');
    const right = Buffer.from(actual, 'utf8');
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private async verifyExternal(
    provider: CaptchaProvider,
    secret: string,
    token: string,
    ip?: string,
  ): Promise<boolean> {
    const url = provider === 'turnstile' ? TURNSTILE_URL : HCAPTCHA_URL;
    const body = new URLSearchParams({ secret, response: token });
    if (ip !== undefined && ip !== '') {
      body.set('remoteip', ip);
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        this.logger.warn(`Captcha provider ${provider} returned HTTP ${response.status}`);
        return false;
      }
      const payload = (await response.json()) as { success?: unknown };
      return payload.success === true;
    } catch (error) {
      this.logger.warn(
        `Captcha provider ${provider} unreachable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}

/** Distorted arithmetic SVG; only generated digits/operators are interpolated. */
function renderArithmeticSvg(expression: string): string {
  const rotate = (Math.random() * 8 - 4).toFixed(1);
  const noise = Array.from({ length: 7 }, () => {
    const x1 = Math.floor(Math.random() * 180);
    const y1 = Math.floor(Math.random() * 56);
    const x2 = Math.floor(Math.random() * 180);
    const y2 = Math.floor(Math.random() * 56);
    const opacity = (0.18 + Math.random() * 0.25).toFixed(2);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7dd3fc" stroke-width="1" opacity="${opacity}" />`;
  }).join('');
  const dots = Array.from({ length: 16 }, () => {
    const cx = Math.floor(Math.random() * 180);
    const cy = Math.floor(Math.random() * 56);
    const r = (Math.random() * 1.6 + 0.4).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#94a3b8" opacity="0.5" />`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="56" viewBox="0 0 180 56" role="img" aria-label="人机验证算式"><rect width="180" height="56" rx="10" fill="#0f172a"/>${noise}${dots}<text x="90" y="37" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="25" font-weight="600" fill="#e2e8f0" letter-spacing="2" transform="rotate(${rotate} 90 30)">${expression} = ?</text></svg>`;
}
