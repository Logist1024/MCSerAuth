import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { GameProfile } from '@mcserauth/shared';
import type { Response } from 'express';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { GameProfileDto } from './dto/game-profile.dto.js';
import { ProfilesBatchRequestDto } from './dto/profiles.dto.js';
import { ProfilesService } from './profiles.service.js';
/**
 * authlib-injector keeps profile lookups under its own `api/profiles`
 * namespace. With the API root set to `/api` that resolves to
 * `/api/api/profiles/minecraft`, so these handlers mirror the canonical
 * `/api/profiles/*` routes.
 */
@ApiTags('authlib-injector')
@ProtocolApi()
@Controller('api/profiles')
export class InjectorProfilesController {
  constructor(private readonly profiles: ProfilesService) {}
  @Get('minecraft/:name')
  @ApiOperation({ summary: '按昵称查询档案（authlib-injector 命名空间）' })
  @ApiParam({ name: 'name', example: 'Notch' })
  @ApiOkResponse({ type: GameProfileDto })
  @ApiNoContentResponse({ description: '玩家不存在' })
  async getByName(
    @Param('name')
    name: string,
    @Res({ passthrough: true })
    response: Response,
  ): Promise<GameProfile | undefined> {
    const profile = await this.profiles.getByName(name);
    if (profile === null) {
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return profile;
  }
  @Post('minecraft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '批量按昵称查询档案（authlib-injector 命名空间）' })
  @ApiBody({ type: ProfilesBatchRequestDto })
  @ApiOkResponse({ type: [GameProfileDto], description: '可能为空数组' })
  async getBatch(
    @Body()
    body: ProfilesBatchRequestDto,
  ): Promise<GameProfile[]> {
    return await this.profiles.getBatch(body.names);
  }
}
