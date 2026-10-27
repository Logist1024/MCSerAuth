import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  normalizeUserRole,
  roleAtLeast,
  type AdminPermission,
  type UserRole,
} from '@mcserauth/shared';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DbService } from '../../db/db.service.js';
import { userPermission } from '../../db/schema/index.js';
import { AccountAccessService, type AccountUser } from '../auth/account-access.service.js';

export interface AdminActor {
  userId: string;
  role: UserRole;
  permissions: AdminPermission[];
  user: AccountUser;
}

/** Cookie-session authorization for the non-protocol admin endpoints. */
@Injectable()
export class AdminAccessService {
  constructor(
    private readonly accounts: AccountAccessService,
    private readonly db: DbService,
  ) {}

  async requireRole(request: Request, roles: readonly UserRole[]): Promise<AdminActor> {
    const user = await this.accounts.requireRole(request, roles);
    this.assertActive(user);
    return this.toActor(user);
  }

  async requireAtLeast(request: Request, minimum: UserRole): Promise<AdminActor> {
    const user = await this.accounts.requireAtLeast(request, minimum);
    this.assertActive(user);
    return this.toActor(user);
  }

  /**
   * Requires a delegated capability. Superadmins implicitly hold every
   * capability; other staff need the explicit grant.
   */
  async requireCapability(
    request: Request,
    permission: AdminPermission,
    minimum: UserRole = 'reviewer',
  ): Promise<AdminActor> {
    const user = await this.accounts.requireUser(request);
    this.assertActive(user);
    const actor = this.toActor(user);
    if (actor.role === 'superadmin') {
      return actor;
    }
    if (!roleAtLeast(actor.role, minimum)) {
      throw new ForbiddenException('没有权限执行此操作');
    }
    if (!actor.permissions.includes(permission)) {
      throw new ForbiddenException('该操作需要超级管理员授权');
    }
    return actor;
  }

  /** Role shortcut plus optional delegated capability (e.g. `users.ban`). */
  async requireCapabilityOrRole(
    request: Request,
    permission: AdminPermission,
    minimumRole: UserRole,
    minimumForCapability: UserRole = 'reviewer',
  ): Promise<AdminActor> {
    const user = await this.accounts.requireUser(request);
    this.assertActive(user);
    const actor = this.toActor(user);
    if (actor.role === 'superadmin' || roleAtLeast(actor.role, minimumRole)) {
      return actor;
    }
    if (roleAtLeast(actor.role, minimumForCapability) && actor.permissions.includes(permission)) {
      return actor;
    }
    throw new ForbiddenException('没有权限执行此操作');
  }

  permissionsFor(userId: string): AdminPermission[] {
    return this.db.db
      .select({ permission: userPermission.permission })
      .from(userPermission)
      .where(eq(userPermission.userId, userId))
      .all()
      .map((row) => row.permission);
  }

  replacePermissions(
    targetUserId: string,
    permissions: AdminPermission[],
    grantedBy: string,
  ): AdminPermission[] {
    const unique = [...new Set(permissions)];
    this.db.db.transaction((tx) => {
      tx.delete(userPermission).where(eq(userPermission.userId, targetUserId)).run();
      if (unique.length > 0) {
        tx.insert(userPermission)
          .values(
            unique.map((permission) => ({
              userId: targetUserId,
              permission,
              grantedBy,
            })),
          )
          .run();
      }
    });
    return unique;
  }

  private toActor(user: AccountUser): AdminActor {
    return {
      userId: user.id,
      role: normalizeUserRole(user.role),
      permissions: this.permissionsFor(user.id),
      user,
    };
  }

  /** Banned staff lose admin access immediately; mutes only block posting. */
  private assertActive(user: AccountUser): void {
    if (user.banned) {
      throw new ForbiddenException('该账号已被封禁');
    }
  }
}
