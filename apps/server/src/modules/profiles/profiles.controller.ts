import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import type { Response } from 'express';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import { GameProfileDto } from './dto/game-profile.dto.js';
import { ProfilesBatchRequestDto } from './dto/profiles.dto.js';
import { ProfilesService } from './profiles.service.js';

/**
 * Player profile lookups.
 *
 * Declared before the generic `:uuid` route so the literal `minecraft` segment
 * is not swallowed by the wildcard. Unknown players return 204 (Yggdrasil
 * convention) rather than an error.
 */
@ApiTags('Commons-Designs / Profiles')
@ProtocolApi()
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('minecraft/:name')
  @ApiOperation({
    summary: '按昵称查询档案',
    description: '返回带 textures 属性的 GameProfile；玩家不存在时 204。',
  })
  @ApiParam({ name: 'name', example: 'Notch' })
  @ApiOkResponse({ type: GameProfileDto })
  @ApiNoContentResponse({ description: '玩家不存在' })
  getByName(
    @Param('name') name: string,
    @Res({ passthrough: true }) response: Response,
  ): GameProfile | undefined {
    const profile = this.profiles.getByName(name);
    if (profile === null) {
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return profile;
  }

  @Post('minecraft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '批量按昵称查询档案',
    description: '一次最多 10 个昵称；未知昵称会被跳过，结果保持请求顺序。',
  })
  @ApiBody({ type: ProfilesBatchRequestDto })
  @ApiOkResponse({ type: [GameProfileDto], description: '可能为空数组' })
  getBatch(@Body() body: ProfilesBatchRequestDto): GameProfile[] {
    return this.profiles.getBatch(body.names);
  }

  @Get(':uuid')
  @ApiOperation({
    summary: '按 UUID 查询档案',
    description: '返回带 textures 属性的 GameProfile；UUID 非法时 400，玩家不存在时 204。',
  })
  @ApiParam({ name: 'uuid', example: '069a79f444e94726a5befca90e38aaf5' })
  @ApiOkResponse({ type: GameProfileDto })
  @ApiNoContentResponse({ description: '玩家不存在' })
  @ApiResponse({ status: 400, type: ProtocolErrorDto })
  getByUuid(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) response: Response,
  ): GameProfile | undefined {
    const normalized = normalizeProtocolUuid(uuid);
    if (normalized === null) {
      throw new BadRequestException('uuid 必须是 32 位十六进制（可带连字符）');
    }

    const profile = this.profiles.getByUuid(normalized);
    if (profile === null) {
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return profile;
  }
}
