import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { normalizeUserRole, roleAtLeast, type UserRole } from '@mcserauth/shared';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DbService } from '../../db/db.service.js';
import { user as userTable } from '../../db/schema/index.js';
import { AuthService } from './auth.service.js';

export type AccountUser = typeof userTable.$inferSelect;

function formatMuteUntil(until: Date): string {
  return until.toLocaleString('zh-CN', { hour12: false });
}

/**
 * Resolves the current website account from the better-auth cookie and reloads
 * the row so role/ban changes take effect immediately (no stale session copy).
 */
@Injectable()
export class AccountAccessService {
  constructor(
    private readonly auth: AuthService,
    private readonly db: DbService,
  ) {}

  async getOptionalUser(request: Request): Promise<AccountUser | null> {
    const session = await this.auth.getSession(request.headers);
    if (!session) {
      return null;
    }
    const row = this.db.db.select().from(userTable).where(eq(userTable.id, session.user.id)).get();
    return row ? { ...row, role: normalizeUserRole(row.role) } : null;
  }

  async requireUser(request: Request): Promise<AccountUser> {
    const user = await this.getOptionalUser(request);
    if (!user) {
      throw new UnauthorizedException('未登录或登录已失效');
    }
    return user;
  }

  assertCanWrite(user: AccountUser): void {
    if (user.banned) {
      throw new ForbiddenException('该账号已被论坛封禁');
    }
    if (user.mutedUntil !== null && user.mutedUntil.getTime() > Date.now()) {
      throw new ForbiddenException(
        `该账号处于禁言状态，解除时间：${formatMuteUntil(user.mutedUntil)}`,
      );
    }
  }

  async requireWritableUser(request: Request): Promise<AccountUser> {
    const user = await this.requireUser(request);
    this.assertCanWrite(user);
    return user;
  }

  async requireRole(request: Request, roles: readonly UserRole[]): Promise<AccountUser> {
    const user = await this.requireUser(request);
    if (!roles.includes(normalizeUserRole(user.role))) {
      throw new ForbiddenException('没有权限执行此操作');
    }
    return user;
  }

  /** Requires at least the given privilege level, so inherited roles pass. */
  async requireAtLeast(request: Request, minimum: UserRole): Promise<AccountUser> {
    const user = await this.requireUser(request);
    if (!roleAtLeast(user.role, minimum)) {
      throw new ForbiddenException('没有权限执行此操作');
    }
    return user;
  }

  isModerator(user: AccountUser | UserRole | null): boolean {
    if (user === null) {
      return false;
    }
    return roleAtLeast(typeof user === 'string' ? user : user.role, 'reviewer');
  }
}
