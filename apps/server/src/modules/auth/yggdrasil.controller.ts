import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { YggdrasilMetadata } from '@mcserauth/shared';
import type { Request } from 'express';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import {
  YggdrasilAuthenticateRequestDto,
  YggdrasilAuthenticateResponseDto,
  YggdrasilMetadataDto,
  YggdrasilRefreshRequestDto,
  YggdrasilRefreshResponseDto,
  YggdrasilValidateRequestDto,
} from './dto/yggdrasil.dto.js';
import { YggdrasilService } from './yggdrasil.service.js';
/**
 * API root metadata.
 *
 * The root is `http://<host>:8000/api`, so launchers call `/api/authserver/*`,
 * `/api/sessionserver/*` and `/api/minecraft/profile/*` on the same origin.
 */
@ApiTags('authlib-injector')
@ProtocolApi()
@Controller()
export class YggdrasilMetadataController {
  constructor(private readonly yggdrasil: YggdrasilService) {}
  @Get()
  @ApiOperation({
    summary: 'API 元数据（authlib-injector 根路径）',
    description:
      'HMCL/PCL2 在「外置登录」填入 http://<host>:8000/api 后首先请求本端点；不含 signaturePublickey，纹理属性无需签名。',
  })
  @ApiOkResponse({ type: YggdrasilMetadataDto })
  getMetadata(): YggdrasilMetadata {
    return this.yggdrasil.metadata();
  }
}
/**
 * Yggdrasil password login / token lifecycle.
 *
 * Throttled per-IP because `/authenticate` checks website credentials: without
 * a limit this endpoint becomes an unthrottled brute-force channel even though
 * the browser sign-in endpoints sit behind the express credential limiter and
 * the captcha. Limits mirror main.ts: 10 logins/min, looser ceilings for the
 * token endpoints launchers poll.
 */
@ApiTags('authlib-injector')
@ProtocolApi()
@UseGuards(ThrottlerGuard)
@Controller('authserver')
export class YggdrasilAuthController {
  constructor(private readonly yggdrasil: YggdrasilService) {}
  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: '用网站邮箱 + 密码登录（authlib-injector）',
    description:
      '校验 better-auth 账号密码后签发与 OAuth 流程同源的启动器令牌；凭据错误或封禁返回 403 ForbiddenOperationException。',
  })
  @ApiBody({ type: YggdrasilAuthenticateRequestDto })
  @ApiOkResponse({ type: YggdrasilAuthenticateResponseDto })
  @ApiResponse({ status: 400, type: ProtocolErrorDto })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  async authenticate(
    @Body()
    body: YggdrasilAuthenticateRequestDto,
    @Req()
    request: Request,
  ): Promise<YggdrasilAuthenticateResponseDto> {
    return await this.yggdrasil.authenticate(body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: '轮换访问令牌（authlib-injector）',
    description: '旧 accessToken 立即失效；未知、过期、已吊销或封禁返回 403。',
  })
  @ApiBody({ type: YggdrasilRefreshRequestDto })
  @ApiOkResponse({ type: YggdrasilRefreshResponseDto })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  async refresh(
    @Body()
    body: YggdrasilRefreshRequestDto,
    @Req()
    request: Request,
  ): Promise<YggdrasilRefreshResponseDto> {
    return await this.yggdrasil.refresh(body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
  @Post('validate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: '校验访问令牌（authlib-injector）' })
  @ApiBody({ type: YggdrasilValidateRequestDto })
  @ApiNoContentResponse({ description: '令牌有效' })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  // Must await: validate() rejects asynchronously, and an unawaited rejection
  // fires after the 204 is already sent (found by the 2026-11-01 F1 drill —
  // invalid tokens answered 204 and the ForbiddenException only hit stderr).
  async validate(
    @Body()
    body: YggdrasilValidateRequestDto,
  ): Promise<void> {
    await this.yggdrasil.validate(body.accessToken);
  }
  @Post('invalidate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: '吊销访问令牌（authlib-injector）',
    description: '幂等：未知或已吊销的令牌同样返回 204；吊销后 Bearer 立即 401。',
  })
  @ApiBody({ type: YggdrasilValidateRequestDto })
  @ApiNoContentResponse({ description: '令牌已吊销（或本就不存在）' })
  async invalidate(
    @Body()
    body: YggdrasilValidateRequestDto,
  ): Promise<void> {
    await this.yggdrasil.invalidate(body);
  }
}
