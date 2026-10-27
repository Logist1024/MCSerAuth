import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { UserProfilesMeResponse } from '@mcserauth/shared';
import type { Request } from 'express';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import { AuthService } from './auth.service.js';
import { UserProfilesMeResponseDto } from './dto/oauth.dto.js';
import { OAuthService } from './oauth.service.js';
/**
 * `GET /api/user/profiles/me` — the current account plus its 1:1 game player.
 *
 * Accepts either a launcher Bearer token or the better-auth website cookie, so
 * the same endpoint serves both protocol clients and the web session widget.
 */
@ApiTags('Commons-Designs / User')
@ProtocolApi()
@Controller('user/profiles')
export class UserProfilesController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
  ) {}
  @Get('me')
  @ApiBearerAuth('launcher-token')
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: '获取当前用户档案',
    description:
      '优先使用 Authorization: Bearer <access_token>（启动器）；未携带时回退到 better-auth 网站会话。',
  })
  @ApiOkResponse({ type: UserProfilesMeResponseDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  async getMe(
    @Req()
    request: Request,
  ): Promise<UserProfilesMeResponse> {
    const authorization = request.headers.authorization;
    if (authorization !== undefined) {
      const match = /^Bearer\s+(\S+)$/i.exec(authorization);
      const accessToken = match?.[1];
      if (!accessToken) {
        throw new UnauthorizedException('Authorization 头格式应为 Bearer <access_token>');
      }
      const profile = await this.oauth.resolveAccessToken(accessToken);
      if (!profile) {
        throw new UnauthorizedException('访问令牌无效或已过期');
      }
      return profile;
    }
    const session = await this.auth.getSession(request.headers);
    if (!session) {
      throw new UnauthorizedException('未登录或登录已失效');
    }
    const profile = await this.oauth.getUserProfile(session.user.id);
    if (!profile) {
      throw new UnauthorizedException('账号不存在');
    }
    return profile;
  }
}
