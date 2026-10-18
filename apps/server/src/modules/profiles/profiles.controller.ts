import { Body, Controller, Get, NotImplementedException, Param, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import { GameProfileDto } from './dto/game-profile.dto.js';
import { ProfilesBatchRequestDto } from './dto/profiles.dto.js';

const STUB_MESSAGE = 'M0 stub: profile lookup is implemented in M2';

/**
 * Player profile lookups (M0 stubs).
 *
 * Declared before the generic `:uuid` route so the literal `minecraft` segment
 * is not swallowed by the wildcard.
 */
@ApiTags('Commons-Designs / Profiles')
@ProtocolApi()
@Controller('profiles')
export class ProfilesController {
  @Get('minecraft/:name')
  @ApiOperation({
    summary: '按昵称查询档案（M0 stub）',
    description: 'M0 返回 501；M2 返回 GameProfile。',
  })
  @ApiParam({ name: 'name', example: 'Notch' })
  @ApiOkResponse({ type: GameProfileDto, description: 'M2 目标响应（M0 不返回）' })
  @ApiResponse({ status: 501, type: ProtocolErrorDto })
  getByName(@Param('name') _name: string): never {
    throw new NotImplementedException(STUB_MESSAGE);
  }

  @Post('minecraft')
  @ApiOperation({
    summary: '批量按昵称查询档案（M0 stub）',
    description: 'M0 返回 501；M2 最多返回 10 个 GameProfile。',
  })
  @ApiBody({ type: ProfilesBatchRequestDto })
  @ApiOkResponse({ type: [GameProfileDto], description: 'M2 目标响应（M0 不返回）' })
  @ApiResponse({ status: 501, type: ProtocolErrorDto })
  getBatch(@Body() _body: ProfilesBatchRequestDto): never {
    throw new NotImplementedException(STUB_MESSAGE);
  }

  @Get(':uuid')
  @ApiOperation({
    summary: '按 UUID 查询档案（M0 stub）',
    description: 'M0 返回 501；M2 返回 GameProfile（含 textures 属性）。',
  })
  @ApiParam({ name: 'uuid', example: '069a79f444e94726a5befca90e38aaf5' })
  @ApiOkResponse({ type: GameProfileDto, description: 'M2 目标响应（M0 不返回）' })
  @ApiResponse({ status: 501, type: ProtocolErrorDto })
  getByUuid(@Param('uuid') _uuid: string): never {
    throw new NotImplementedException(STUB_MESSAGE);
  }
}
