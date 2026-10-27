import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ConsoleSessionResponse, ConsoleStaffMember, SiteSettings } from '@mcserauth/shared';
import type { Request, Response } from 'express';
import { ConsoleAuthService } from './console-auth.service.js';
import { ConsoleLoginDto, ConsoleSiteUpdateDto, UpdateUserRoleDto } from './dto/site.dto.js';
import { SiteService } from './site.service.js';
/** Key-protected root console: site configuration and all staff roles. */
@ApiTags('Console')
@UseGuards(ThrottlerGuard)
@Controller('console')
export class ConsoleController {
  constructor(
    private readonly auth: ConsoleAuthService,
    private readonly site: SiteService,
  ) {}
  @Get('session')
  @ApiOperation({ summary: '控制台可用性与登录状态' })
  async session(
    @Req()
    request: Request,
  ): Promise<ConsoleSessionResponse> {
    const expiry = await this.auth.sessionExpiry(request);
    return {
      enabled: this.auth.enabled,
      authenticated: expiry !== null,
      expiresAt: expiry?.toISOString() ?? null,
    };
  }
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @ApiOperation({ summary: '使用 CONSOLE_KEY 登录控制台' })
  @ApiBody({ type: ConsoleLoginDto })
  login(
    @Body()
    body: ConsoleLoginDto,
    @Res({ passthrough: true })
    response: Response,
  ): {
    expiresAt: string;
  } {
    return this.auth.login(body.key, response);
  }
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '退出控制台' })
  logout(
    @Res({ passthrough: true })
    response: Response,
  ): {
    loggedOut: true;
  } {
    this.auth.logout(response);
    return { loggedOut: true };
  }
  @Get('settings')
  @ApiOperation({ summary: '读取全站配置（含发件设置）' })
  async settings(
    @Req()
    request: Request,
  ): Promise<SiteSettings> {
    this.auth.requireSession(request);
    return await this.site.getSettings();
  }
  @Patch('settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '修改全站配置（含发件设置）' })
  @ApiBody({ type: ConsoleSiteUpdateDto })
  async updateSettings(
    @Req()
    request: Request,
    @Body()
    body: ConsoleSiteUpdateDto,
  ): Promise<SiteSettings> {
    this.auth.requireSession(request);
    return await this.site.updateSettings(body, null);
  }
  @Get('staff')
  @ApiOperation({ summary: '全部审核员/管理员/超级管理员' })
  async staff(
    @Req()
    request: Request,
  ): Promise<ConsoleStaffMember[]> {
    this.auth.requireSession(request);
    return await this.site.listStaff();
  }
  @Get('users')
  @ApiOperation({ summary: '搜索任意用户（用于提升角色）' })
  async users(
    @Req()
    request: Request,
    @Query('search')
    search?: string,
  ): Promise<ConsoleStaffMember[]> {
    this.auth.requireSession(request);
    return await this.site.searchUsers(search);
  }
  @Patch('staff/:id/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '调整任意角色（含超级管理员）' })
  @ApiBody({ type: UpdateUserRoleDto })
  async updateRole(
    @Req()
    request: Request,
    @Param('id')
    id: string,
    @Body()
    body: UpdateUserRoleDto,
  ): Promise<ConsoleStaffMember> {
    this.auth.requireSession(request);
    return await this.site.setUserRole(id, body.role, {
      actorId: null,
      actorRole: null,
      source: 'console',
    });
  }
}
