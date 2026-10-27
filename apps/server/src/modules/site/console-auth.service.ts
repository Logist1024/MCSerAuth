import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { AppConfigService } from '../../config/app-config.service.js';

export const CONSOLE_COOKIE = 'mcserauth_console';
const TOKEN_VERSION = 'v1';

function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (header === undefined || header === '') {
    return cookies;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name !== '') {
      cookies.set(name, decodeURIComponent(value));
    }
  }
  return cookies;
}

/** Key-only root console session (independent from website accounts). */
@Injectable()
export class ConsoleAuthService {
  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return this.config.consoleKey !== undefined && this.config.consoleKey !== '';
  }

  login(key: string, response: Response): { expiresAt: string } {
    if (!this.enabled) {
      throw new ServiceUnavailableException('超级后台未启用：请在服务端配置 CONSOLE_KEY');
    }
    const expected = createHash('sha256')
      .update(this.config.consoleKey ?? '')
      .digest();
    const actual = createHash('sha256').update(key).digest();
    if (!timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException('控制台密钥不正确');
    }

    const expiresAt = Math.floor(Date.now() / 1000) + this.config.consoleSessionTtlSeconds;
    response.cookie(CONSOLE_COOKIE, `${TOKEN_VERSION}.${expiresAt}.${this.sign(expiresAt)}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
      path: '/',
      maxAge: this.config.consoleSessionTtlSeconds * 1000,
    });
    return { expiresAt: new Date(expiresAt * 1000).toISOString() };
  }

  logout(response: Response): void {
    response.clearCookie(CONSOLE_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
      path: '/',
    });
  }

  /** Returns the session expiry, or null when the cookie is missing/invalid. */
  sessionExpiry(request: Request): Date | null {
    const token = parseCookies(request.headers.cookie).get(CONSOLE_COOKIE);
    if (token === undefined) {
      return null;
    }
    const [version, expiresPart, signature] = token.split('.');
    if (version !== TOKEN_VERSION || expiresPart === undefined || signature === undefined) {
      return null;
    }
    const expiresAt = Number(expiresPart);
    if (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    const expected = Buffer.from(this.sign(expiresAt));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }
    return new Date(expiresAt * 1000);
  }

  requireSession(request: Request): Date {
    const expiry = this.sessionExpiry(request);
    if (expiry === null) {
      throw new UnauthorizedException('请先使用控制台密钥登录');
    }
    return expiry;
  }

  private sign(expiresAt: number): string {
    const keyFingerprint = createHash('sha256')
      .update(this.config.consoleKey ?? '')
      .digest('base64url');
    return createHmac('sha256', this.config.betterAuthSecret)
      .update(`console-session:${expiresAt}:${keyFingerprint}`)
      .digest('base64url');
  }
}
