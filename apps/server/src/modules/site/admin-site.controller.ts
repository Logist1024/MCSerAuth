import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ConsoleStaffMember, SiteDisplaySettings } from '@mcserauth/shared';
import type { Request } from 'express';
import { AdminAccessService } from '../admin/admin-access.service.js';
import { AdminSiteUpdateDto, UpdateUserRoleDto } from './dto/site.dto.js';
import { MAX_SITE_ICON_BYTES, SiteService } from './site.service.js';
/** Site-wide display settings and staff roles (site.manage / superadmin). */
@ApiTags('Admin')
@ApiCookieAuth('better-auth.session_token')
@Controller('admin/site')
export class AdminSiteController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly site: SiteService,
  ) {}
  @Get()
  @ApiOperation({ summary: '读取站点展示配置（site.manage）' })
  async get(
    @Req()
    request: Request,
  ): Promise<SiteDisplaySettings> {
    await this.access.requireCapability(request, 'site.manage');
    return await this.site.getDisplaySettings();
  }
  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '修改站点展示信息、自定义 CSS 与首页内容（site.manage）',
  })
  @ApiBody({ type: AdminSiteUpdateDto })
  async update(
    @Req()
    request: Request,
    @Body()
    body: AdminSiteUpdateDto,
  ): Promise<SiteDisplaySettings> {
    const actor = await this.access.requireCapability(request, 'site.manage');
    await this.site.updateSettings(body, actor.userId);
    return await this.site.getDisplaySettings();
  }
  @Post('icon')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SITE_ICON_BYTES, files: 1 } }))
  @ApiOperation({ summary: '上传站点图标（PNG/JPEG/WebP/GIF，≤1 MiB；site.manage）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadIcon(
    @Req()
    request: Request,
    @UploadedFile()
    file: Express.Multer.File | undefined,
  ): Promise<SiteDisplaySettings> {
    const actor = await this.access.requireCapability(request, 'site.manage');
    return await this.site.setIcon(file, actor.userId);
  }
  @Delete('icon')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '移除站点图标，恢复内置标志（site.manage）' })
  async removeIcon(
    @Req()
    request: Request,
  ): Promise<SiteDisplaySettings> {
    const actor = await this.access.requireCapability(request, 'site.manage');
    return await this.site.clearIcon(actor.userId);
  }
  @Get('staff')
  @ApiOperation({ summary: '审核员/管理员/超级管理员列表（superadmin）' })
  async staff(
    @Req()
    request: Request,
  ): Promise<ConsoleStaffMember[]> {
    await this.access.requireAtLeast(request, 'superadmin');
    return await this.site.listStaff();
  }
  @Patch('staff/:id/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '调整审核员或管理员角色（superadmin）',
    description: '超级管理员角色只能在密钥保护的控制台中调整。',
  })
  @ApiBody({ type: UpdateUserRoleDto })
  async updateRole(
    @Req()
    request: Request,
    @Param('id')
    id: string,
    @Body()
    body: UpdateUserRoleDto,
  ): Promise<ConsoleStaffMember> {
    const actor = await this.access.requireAtLeast(request, 'superadmin');
    return await this.site.setUserRole(id, body.role, {
      actorId: actor.userId,
      actorRole: actor.role,
      source: 'web',
    });
  }
}
