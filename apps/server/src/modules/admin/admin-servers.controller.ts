import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { apiSuccessArraySchema, apiSuccessSchema } from '../../common/swagger/api-envelope.js';
import { AdminAccessService } from './admin-access.service.js';
import { AdminServersService } from './admin-servers.service.js';
import { CreateServerDto, ServerEntryDto, UpdateServerDto } from './dto/admin.dto.js';

/** Server allow-list management — website cookie sessions with role `admin`. */
@ApiTags('Admin')
@ApiCookieAuth('better-auth.session_token')
@ApiExtraModels(ServerEntryDto)
@Controller('admin/servers')
export class AdminServersController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly servers: AdminServersService,
  ) {}

  @Get()
  @ApiOperation({ summary: '列出服务器白名单（servers.manage）' })
  @ApiOkResponse({ schema: apiSuccessArraySchema(ServerEntryDto) })
  async list(@Req() request: Request): Promise<ServerEntryDto[]> {
    await this.access.requireCapability(request, 'servers.manage');
    return this.servers.list();
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '登记服务器（servers.manage）',
    description: '库中只存密钥哈希；明文密钥只在本次响应中返回一次。',
  })
  @ApiBody({ type: CreateServerDto })
  @ApiOkResponse({ schema: apiSuccessSchema(ServerEntryDto) })
  @ApiResponse({ status: 409, description: 'serverId 已存在' })
  async create(@Req() request: Request, @Body() body: CreateServerDto): Promise<ServerEntryDto> {
    await this.access.requireCapability(request, 'servers.manage');
    return this.servers.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新服务器名称或启用状态（servers.manage）' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiBody({ type: UpdateServerDto })
  @ApiOkResponse({ schema: apiSuccessSchema(ServerEntryDto) })
  async update(
    @Req() request: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateServerDto,
  ): Promise<ServerEntryDto> {
    await this.access.requireCapability(request, 'servers.manage');
    return this.servers.update(id, body);
  }
}
