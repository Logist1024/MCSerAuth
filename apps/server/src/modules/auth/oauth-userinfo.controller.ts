import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { OAuthUserInfoResponse } from '@mcserauth/shared';
import type { Request } from 'express';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import { OAuthService } from './oauth.service.js';

class OAuthUserInfoPlayerDto {
  @ApiProperty({ description: '玩家 UUID（32 位无连字符）' })
  uuid!: string;

  @ApiProperty()
  nickname!: string;

  @ApiProperty()
  banned!: boolean;
}

class OAuthUserInfoUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ description: '仅 scope 含 email 时返回' })
  email?: string;
}

class OAuthUserInfoResponseDto implements OAuthUserInfoResponse {
  @ApiProperty({ type: OAuthUserInfoUserDto })
  user!: OAuthUserInfoUserDto;

  @ApiPropertyOptional({ type: OAuthUserInfoPlayerDto, description: '仅 scope 含 player 时返回' })
  player?: OAuthUserInfoPlayerDto;
}

/**
 * `GET|POST /api/oauth/userinfo` — scope-filtered account info for registered
 * sibling services. This is the endpoint that hands out the Minecraft player
 * UUID (`player` scope). Protocol shape: errors use `{error, errorMessage}`.
 */
@ApiTags('Commons-Designs / OAuth')
@ProtocolApi()
@UseGuards(ThrottlerGuard)
@Controller('oauth')
export class OAuthUserinfoController {
  constructor(private readonly oauth: OAuthService) {}
  @Get('userinfo')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiBearerAuth('launcher-token')
  @ApiOperation({
    summary: '获取当前授权用户信息',
    description:
      '按授权 scope 返回账号与游戏角色信息：basic 恒有（id/name）；email 追加邮箱；player 追加玩家 UUID/昵称。',
  })
  @ApiOkResponse({ type: OAuthUserInfoResponseDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  async getUserinfo(@Req() request: Request): Promise<OAuthUserInfoResponse> {
    return await this.resolve(request);
  }
  @Post('userinfo')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiBearerAuth('launcher-token')
  @ApiOperation({ summary: '获取当前授权用户信息（POST 变体）' })
  @ApiOkResponse({ type: OAuthUserInfoResponseDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  async postUserinfo(@Req() request: Request): Promise<OAuthUserInfoResponse> {
    return await this.resolve(request);
  }
  private async resolve(request: Request): Promise<OAuthUserInfoResponse> {
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '');
    const accessToken = match?.[1];
    if (!accessToken) {
      throw new UnauthorizedException('Authorization 头格式应为 Bearer <access_token>');
    }
    const info = await this.oauth.resolveUserInfo(accessToken);
    if (!info) {
      throw new UnauthorizedException('访问令牌无效或已过期');
    }
    return info;
  }
}
