import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { GameProfile } from '@mcserauth/shared';
import type { Request, Response } from 'express';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import { GameProfileDto } from '../profiles/dto/game-profile.dto.js';
import { HasJoinedQueryDto, JoinServerRequestDto } from './dto/session.dto.js';
import { SessionService } from './session.service.js';

/**
 * Minecraft session service used by game servers.
 *
 * `POST /api/session/hasJoined` follows the M0 endpoint list; a GET variant is
 * registered as well because authlib-injector deployments traditionally query
 * hasJoined over GET. Both variants share the same implementation and are
 * recorded in the protocol checklist for verification.
 */
@ApiTags('Commons-Designs / Session')
@ProtocolApi()
@Controller('session')
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Post('joinServer')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '记录客户端加入会话',
    description:
      '校验启动器令牌、selectedProfile 与服务器白名单后，写入短期 joinServer 会话；封禁玩家返回 403。',
  })
  @ApiBody({ type: JoinServerRequestDto })
  @ApiNoContentResponse({ description: '会话已记录' })
  @ApiResponse({ status: 400, type: ProtocolErrorDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  joinServer(@Body() body: JoinServerRequestDto, @Req() request: Request): void {
    this.sessions.joinServer(body, { ip: request.ip });
  }

  @Post('hasJoined')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '查询某玩家最近会话（POST 变体）',
    description:
      '校验服务器白名单与 player.banned；命中有效会话时返回带 textures 的 GameProfile，否则 204。',
  })
  @ApiBody({ type: HasJoinedQueryDto })
  @ApiOkResponse({ type: GameProfileDto })
  @ApiNoContentResponse({ description: '无有效会话或玩家不存在' })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  async hasJoinedByPost(
    @Body() query: HasJoinedQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<GameProfile | undefined> {
    return this.respond(query, response);
  }

  @Get('hasJoined')
  @ApiOperation({
    summary: '查询某玩家最近会话（GET 兼容变体）',
    description: 'authlib-injector 生态惯用 GET；与 POST 变体共用实现。',
  })
  @ApiOkResponse({ type: GameProfileDto })
  @ApiNoContentResponse({ description: '无有效会话或玩家不存在' })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  async hasJoinedByGet(
    @Query() query: HasJoinedQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<GameProfile | undefined> {
    return this.respond(query, response);
  }

  private respond(query: HasJoinedQueryDto, response: Response): GameProfile | undefined {
    const profile = this.sessions.hasJoined(query);
    if (profile === null) {
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return profile;
  }
}
