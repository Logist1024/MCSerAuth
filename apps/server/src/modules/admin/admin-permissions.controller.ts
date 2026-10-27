import { BadRequestException, Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { normalizeUserRole, type AdminPermission } from '@mcserauth/shared';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DbService } from '../../db/db.service.js';
import { moderationLog, user as userTable } from '../../db/schema/index.js';
import { AdminAccessService } from './admin-access.service.js';
import { UpdatePermissionsDto } from './dto/admin-growth.dto.js';
/** Superadmin-only delegation of specific capabilities to staff accounts. */
@ApiTags('Admin')
@ApiCookieAuth('better-auth.session_token')
@Controller('admin/site')
export class AdminPermissionsController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly db: DbService,
  ) {}
  @Get('permissions/:id')
  @ApiOperation({ summary: '读取某位员工的已下放权限（superadmin）' })
  async get(
    @Req()
    request: Request,
    @Param('id')
    id: string,
  ): Promise<{
    userId: string;
    permissions: AdminPermission[];
  }> {
    await this.access.requireAtLeast(request, 'superadmin');
    await this.requireStaff(id);
    return { userId: id, permissions: await this.access.permissionsFor(id) };
  }
  @Put('permissions/:id')
  @ApiOperation({ summary: '替换某位员工的权限集合（superadmin）' })
  @ApiBody({ type: UpdatePermissionsDto })
  async replace(
    @Req()
    request: Request,
    @Param('id')
    id: string,
    @Body()
    body: UpdatePermissionsDto,
  ): Promise<{
    userId: string;
    permissions: AdminPermission[];
  }> {
    const actor = await this.access.requireAtLeast(request, 'superadmin');
    await this.requireStaff(id);
    const permissions = await this.access.replacePermissions(id, body.permissions, actor.userId);
    await this.db.db.insert(moderationLog).values({
      actorId: actor.userId,
      action: 'grant_permission',
      targetType: 'user',
      targetId: id,
      reason: permissions.length === 0 ? 'cleared' : permissions.join(','),
    });
    return { userId: id, permissions };
  }
  private async requireStaff(userId: string): Promise<void> {
    const target = (
      await this.db.db
        .select({ id: userTable.id, role: userTable.role })
        .from(userTable)
        .where(eq(userTable.id, userId))
    )[0];
    if (!target) {
      throw new BadRequestException('用户不存在');
    }
    const role = normalizeUserRole(target.role);
    if (role === 'superadmin') {
      throw new BadRequestException('超级管理员默认拥有全部权限，无需单独授予');
    }
    if (role !== 'reviewer' && role !== 'admin') {
      throw new BadRequestException('只能给审核员或管理员下放权限');
    }
  }
}
