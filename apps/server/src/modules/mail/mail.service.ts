import { Injectable, Logger } from '@nestjs/common';
import type { Transporter } from 'nodemailer';
import { decryptSiteSecret } from '../../common/crypto/site-secret.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DbService } from '../../db/db.service.js';
import { siteSetting } from '../../db/schema/index.js';

interface VerificationPayload {
  email: string;
  name: string;
  /** Absolute better-auth `/verify-email?token=…` URL. */
  url: string;
}

interface MailConfig {
  provider: string;
  from: string;
  host: string | null;
  port: number;
  user: string | null;
  pass: string | null;
}

/**
 * Outgoing mail. Precedence: admin-console settings (`site_setting`, where the
 * SMTP password is stored AES-encrypted from BETTER_AUTH_SECRET) then `.env`.
 * `console` renders the message into the server log (local development; the
 * verify link is copy-pasteable). SMTP failures swap to the console fallback so
 * account flows never hard-fail on mail delivery.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transportKey: string | null = null;
  private transport: Transporter | null = null;

  constructor(
    private readonly db: DbService,
    private readonly config: AppConfigService,
  ) {}

  async sendVerificationEmail(payload: VerificationPayload): Promise<void> {
    const subject = '【MCSerAuth】完成邮箱验证';
    const html = verificationHtml(payload.name, payload.url);
    const text = `你好 ${payload.name}：

请点击下面链接完成 MCSerAuth 邮箱验证（30 分钟内有效）：
${payload.url}

如非本人操作请忽略本邮件。`;
    await this.deliver(payload.email, subject, html, text);
  }

  async sendPasswordResetEmail(payload: VerificationPayload): Promise<void> {
    const subject = '【MCSerAuth】重置你的密码';
    const html = passwordResetHtml(payload.name, payload.url);
    const text = `你好 ${payload.name}：

请点击下面链接重置你的 MCSerAuth 密码（1 小时内有效）：
${payload.url}

如非本人操作请忽略本邮件，账号不会受影响。`;
    await this.deliver(payload.email, subject, html, text);
  }

  private mailConfig(): MailConfig {
    const values = new Map<string, unknown>();
    for (const row of this.db.db.select().from(siteSetting).all()) {
      try {
        values.set(row.key, JSON.parse(row.value) as unknown);
      } catch {
        values.set(row.key, row.value);
      }
    }
    const provider =
      (values.get('mailProvider') as string | undefined) ?? this.config.mailProvider;
    const envPass = this.config.smtpPass;
    let pass: string | null = null;
    const storedPass = values.get('smtpPass');
    if (typeof storedPass === 'string' && storedPass !== '') {
      pass = decryptSiteSecret(storedPass, this.config.betterAuthSecret);
      if (pass === null) {
        this.logger.warn('Stored SMTP password could not be decrypted; check BETTER_AUTH_SECRET.');
      }
    } else {
      pass = envPass ?? null;
    }
    const host = values.get('smtpHost');
    const user = values.get('smtpUser');
    const portRow = values.get('smtpPort');
    return {
      provider: provider === 'resend' ? 'smtp' : provider === 'smtp' ? 'smtp' : provider,
      from: (values.get('mailFrom') as string | undefined) ?? this.config.mailFrom,
      host: typeof host === 'string' && host.trim() !== '' ? host.trim() : (this.config.smtpHost ?? null),
      port: typeof portRow === 'number' ? portRow : (this.config.smtpPort ?? 587),
      user: typeof user === 'string' && user.trim() !== '' ? user.trim() : (this.config.smtpUser ?? null),
      pass,
    };
  }

  private async deliver(
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<void> {
    const config = this.mailConfig();
    const transport = config.provider === 'smtp' ? await this.resolveTransport(config) : null;
    if (transport === null) {
      this.logger.log(`[mail:console] to=${to} subject="${subject}"\n${text}`);
      return;
    }
    try {
      await transport.sendMail({ from: config.from, to, subject, html, text });
      this.logger.log(`[mail:smtp] delivered to=${to} subject="${subject}"`);
    } catch (error) {
      // Delivery is best-effort: better-auth awaits the send during sign-up,
      // so swallow provider hiccups instead of failing account creation.
      this.logger.warn(
        `SMTP delivery failed (${error instanceof Error ? error.message : String(error)}); printing to console instead`,
      );
      this.logger.log(`[mail:fallback] to=${to} subject="${subject}"\n${text}`);
    }
  }

  private async resolveTransport(config: MailConfig): Promise<Transporter | null> {
    const key = `${config.host}:${config.port}:${config.user}:${config.pass}`;
    if (this.transport !== null && this.transportKey === key) {
      return this.transport;
    }
    if (config.host === null) {
      this.logger.warn('SMTP provider selected without a host; falling back to console mail.');
      return null;
    }
    try {
      const { createTransport } = await import('nodemailer');
      this.transport = createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        ...(config.user !== null && config.pass !== null
          ? { auth: { user: config.user, pass: config.pass } }
          : {}),
      });
      this.transportKey = key;
      return this.transport;
    } catch (error) {
      this.logger.warn(
        `SMTP transport unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.transport = null;
      this.transportKey = null;
      return null;
    }
  }
}

function verificationHtml(name: string, url: string): string {
  return `<!doctype html><html lang="zh-CN"><body style="font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem"><div style="max-width:32rem;margin:auto;background:#1e293b;border:1px solid #334155;border-radius:1rem;padding:2rem"><h2 style="margin:0 0 1rem">完成邮箱验证</h2><p style="color:#94a3b8;line-height:1.6">你好 ${escapeHtml(name)}，请点击下面的按钮完成 MCSerAuth 邮箱验证（30 分钟内有效）：</p><p style="margin:1.5rem 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0ea5e9;color:#f8fafc;padding:0.65rem 1.2rem;border-radius:0.5rem;text-decoration:none;font-weight:600">完成验证</a></p><p style="color:#64748b;font-size:0.8rem">如按钮无效，请复制以下链接到浏览器打开：<br /><code style="word-break:break-all">${escapeHtml(url)}</code></p><p style="color:#64748b;font-size:0.8rem">如非本人操作，请忽略本邮件。</p></div></body></html>`;
}

function passwordResetHtml(name: string, url: string): string {
  return `<!doctype html><html lang="zh-CN"><body style="font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem"><div style="max-width:32rem;margin:auto;background:#1e293b;border:1px solid #334155;border-radius:1rem;padding:2rem"><h2 style="margin:0 0 1rem">重置你的密码</h2><p style="color:#94a3b8;line-height:1.6">你好 ${escapeHtml(name)}，请点击下面的按钮重置你的 MCSerAuth 密码（1 小时内有效）：</p><p style="margin:1.5rem 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#f59e0b;color:#0f172a;padding:0.65rem 1.2rem;border-radius:0.5rem;text-decoration:none;font-weight:600">重置密码</a></p><p style="color:#64748b;font-size:0.8rem">如按钮无效，请复制以下链接到浏览器打开：<br /><code style="word-break:break-all">${escapeHtml(url)}</code></p><p style="color:#64748b;font-size:0.8rem">如非本人操作，请忽略本邮件，你的账号不会受影响。</p></div></body></html>`;
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => replacements[character] ?? character);
}
