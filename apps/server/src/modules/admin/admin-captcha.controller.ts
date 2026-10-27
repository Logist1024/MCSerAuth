import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CaptchaSettings } from '@mcserauth/shared';
import type { Request } from 'express';
import { CaptchaService } from '../captcha/captcha.service.js';
import { AdminAccessService } from './admin-access.service.js';
import { UpdateCaptchaDto } from '../captcha/dto/captcha.dto.js';

/** Captcha toggle and provider keys (superadmin or `site.manage` delegates). */
@ApiTags('Admin')
@ApiCookieAuth('better-auth.session_token')
@Controller('admin/site/captcha')
export class AdminCaptchaController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly captcha: CaptchaService,
  ) {}

  @Get()
  @ApiOperation({ summary: '读取人机验证配置（site.manage）' })
  async get(@Req() request: Request): Promise<CaptchaSettings> {
    await this.access.requireCapability(request, 'site.manage');
    return this.captcha.adminSettings();
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '修改人机验证配置（site.manage）' })
  @ApiBody({ type: UpdateCaptchaDto })
  async update(@Req() request: Request, @Body() body: UpdateCaptchaDto): Promise<CaptchaSettings> {
    const actor = await this.access.requireCapability(request, 'site.manage');
    return this.captcha.updateSettings(actor.userId, body);
  }
}
