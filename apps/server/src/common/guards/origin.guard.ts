import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@mcserauth/shared';
import type { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service.js';
import { PROTOCOL_API_KEY } from '../decorators/protocol-api.decorator.js';
import { BusinessException } from '../exceptions/business.exception.js';
import { isTrustedOrigin, normalizeOrigin } from '../utils/origin.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SESSION_COOKIE_PATTERN =
  /(?:^|;\s*)(?:(?:__Secure-)?better-auth\.session_token|mcserauth_console)=/;

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * CSRF defence for cookie-authenticated writes.
 *
 * Browsers always attach `Origin` to unsafe cross-origin requests, so a
 * present-but-untrusted origin is rejected. Requests without any origin are
 * non-browser clients (curl, launchers): they are allowed when they carry no
 * website session cookie, and in development for convenience. Production
 * cookie-based automation must send `Origin` explicitly.
 *
 * Commons-Designs protocol controllers are server-to-server and keep their
 * native error shape, so they are skipped.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isProtocol = this.reflector.getAllAndOverride<boolean>(PROTOCOL_API_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isProtocol) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const headerOrigin = firstHeader(request.headers.origin);
    const headerReferer = firstHeader(request.headers.referer);
    const origin = headerOrigin ?? headerReferer;

    if (origin === undefined || origin === '') {
      const hasSessionCookie = SESSION_COOKIE_PATTERN.test(request.headers.cookie ?? '');
      if (!hasSessionCookie || !this.config.isProduction) {
        return true;
      }
      throw new BusinessException(ErrorCode.ORIGIN_BLOCKED, 403, '缺少请求来源，已拒绝该写操作');
    }

    if (!isTrustedOrigin(origin, [this.config.appUrl, this.config.authUrl])) {
      throw new BusinessException(
        ErrorCode.ORIGIN_BLOCKED,
        403,
        `请求来源不受信任：${normalizeOrigin(origin) ?? origin}`,
      );
    }
    return true;
  }
}
