import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type {
  CaptchaChallengeResponse,
  CaptchaPublicConfig,
  CaptchaVerifyResponse,
} from '@mcserauth/shared';
import type { Request } from 'express';
import { CaptchaService } from './captcha.service.js';
import { CaptchaVerifyDto } from './dto/captcha.dto.js';
/** Public human-verification endpoints used by the login/register form. */
@ApiTags('Captcha')
@Controller('captcha')
@UseGuards(ThrottlerGuard)
export class CaptchaController {
  constructor(private readonly captcha: CaptchaService) {}
  @Get('config')
  @ApiOperation({ summary: '人机验证公开配置（是否启用、提供商、Site Key）' })
  async config(): Promise<CaptchaPublicConfig> {
    return await this.captcha.publicConfig();
  }
  @Get('challenge')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '获取内置人机验证题目（SVG）' })
  async challenge(): Promise<CaptchaChallengeResponse> {
    return await this.captcha.createChallenge();
  }
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '校验人机验证并签发一次性登录令牌' })
  @ApiBody({ type: CaptchaVerifyDto })
  async verify(
    @Body()
    body: CaptchaVerifyDto,
    @Req()
    request: Request,
  ): Promise<CaptchaVerifyResponse> {
    return await this.captcha.verify(body, request.ip);
  }
}
