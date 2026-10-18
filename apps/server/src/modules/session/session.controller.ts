import { Body, Controller, Get, NotImplementedException, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import { GameProfileDto } from '../profiles/dto/game-profile.dto.js';
import { HasJoinedQueryDto, JoinServerRequestDto } from './dto/session.dto.js';

const STUB_MESSAGE = 'M0 stub: session service is implemented in M1';

/**
 * Minecraft session service used by game servers (M0 stubs).
 *
 * `POST /api/session/hasJoined` follows the M0 endpoint list;
 * a GET variant is registered as well because authlib-injector deployments
 * traditionally query hasJoined over GET. Both are recorded in the protocol
 * checklist for verification.
 */
@ApiTags('Commons-Designs / Session')
@ProtocolApi()
@Controller('session')
export class SessionController {
  @Post('joinServer')
  @ApiOperation({
    summary: '记录客户端会话（M0 stub）',
    description: 'M0 返回 501；M1 校验令牌与服务器白名单后写入会话。',
  })
  @ApiBody({ type: JoinServerRequestDto })
  @ApiResponse({ status: 204, description: 'Yggdrasil 目标语义（M1 实现）' })
  @ApiResponse({ status: 501, type: ProtocolErrorDto })
  joinServer(@Body() _body: JoinServerRequestDto): never {
    throw new NotImplementedException(STUB_MESSAGE);
  }

  @Post('hasJoined')
  @ApiOperation({
    summary: '查询某玩家最近会话（POST 变体，M0 stub）',
    description: 'M0 返回 501；M1 校验 server_entry 与 player.banned。',
  })
  @ApiBody({ type: HasJoinedQueryDto })
  @ApiResponse({ status: 200, type: GameProfileDto, description: 'Yggdrasil 目标响应（M1）' })
  @ApiResponse({ status: 501, type: ProtocolErrorDto })
  hasJoinedByPost(@Body() _query: HasJoinedQueryDto): never {
    throw new NotImplementedException(STUB_MESSAGE);
  }

  @Get('hasJoined')
  @ApiOperation({
    summary: '查询某玩家最近会话（GET 兼容变体，M0 stub）',
    description: 'authlib-injector 生态惯用 GET；与 POST 变体共用协议核对项。',
  })
  @ApiResponse({ status: 200, type: GameProfileDto, description: 'Yggdrasil 目标响应（M1）' })
  @ApiResponse({ status: 501, type: ProtocolErrorDto })
  hasJoinedByGet(@Query() _query: HasJoinedQueryDto): never {
    throw new NotImplementedException(STUB_MESSAGE);
  }
}
