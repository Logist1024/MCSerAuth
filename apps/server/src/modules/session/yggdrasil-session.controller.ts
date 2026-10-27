import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type GameProfile, normalizeProtocolUuid } from '@mcserauth/shared';
import type { Request, Response } from 'express';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import { GameProfileDto } from '../profiles/dto/game-profile.dto.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import {
  YggdrasilHasJoinedQueryDto,
  YggdrasilJoinRequestDto,
} from './dto/yggdrasil-session.dto.js';
import { SessionService } from './session.service.js';

/**
 * authlib-injector session server.
 *
 * Unlike the native `/api/session/*` endpoints these do **not** require an
 * admin-registered `serverId`: injected clients send the per-handshake hash.
 * The launcher token still has to be valid and the player unbanned.
 */
@ApiTags('authlib-injector')
@ProtocolApi()
@Controller('sessionserver/session/minecraft')
export class YggdrasilSessionController {
  constructor(
    private readonly sessions: SessionService,
    private readonly profiles: ProfilesService,
  ) {}

  @Post('join')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '记录客户端加入会话（authlib-injector）',
    description: '不校验服务器白名单；令牌无效 401，selectedProfile 不匹配或封禁 403。',
  })
  @ApiBody({ type: YggdrasilJoinRequestDto })
  @ApiNoContentResponse({ description: '会话已记录' })
  @ApiResponse({ status: 400, type: ProtocolErrorDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  join(@Body() body: YggdrasilJoinRequestDto, @Req() request: Request): void {
    this.sessions.joinServer(body, { ip: request.ip }, { enforceServerWhitelist: false });
  }

  @Get('hasJoined')
  @ApiOperation({
    summary: '查询某玩家最近会话（authlib-injector）',
    description:
      '命中返回带 textures 的 GameProfile，无会话/未知昵称/IP 不一致返回 204，封禁 403。',
  })
  @ApiOkResponse({ type: GameProfileDto })
  @ApiNoContentResponse({ description: '无有效会话' })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  hasJoined(
    @Query() query: YggdrasilHasJoinedQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): GameProfile | undefined {
    const profile = this.sessions.hasJoined(query, { enforceServerWhitelist: false });
    if (profile === null) {
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return profile;
  }

  @Get('profile/:uuid')
  @ApiOperation({
    summary: '按 UUID 查询档案（authlib-injector）',
    description: '与 /api/profiles/{uuid} 同源；UUID 非法 400，玩家不存在 204。',
  })
  @ApiParam({ name: 'uuid', example: '85cbb85205d944eea137574bd7afe854' })
  @ApiOkResponse({ type: GameProfileDto })
  @ApiNoContentResponse({ description: '玩家不存在' })
  profile(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) response: Response,
  ): GameProfile | undefined {
    const normalized = normalizeProtocolUuid(uuid);
    if (normalized === null) {
      throw new BadRequestException('UUID 必须是 32 位十六进制（可带连字符）');
    }

    const profile = this.profiles.getByUuid(normalized);
    if (profile === null) {
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return profile;
  }
}
