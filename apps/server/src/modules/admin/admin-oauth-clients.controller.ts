import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
import type { AdminOauthClientListResponse, AdminOauthClientView } from '@mcserauth/shared';
import type { Request } from 'express';
import { apiSuccessSchema } from '../../common/swagger/api-envelope.js';
import { OAuthClientService } from '../auth/oauth-client.service.js';
import { AdminAccessService } from './admin-access.service.js';
import {
  AdminOauthClientDto,
  CreateOauthClientDto,
  UpdateOauthClientDto,
} from './dto/admin.dto.js';

/** Registered OAuth clients for sibling services — cookie sessions with the `oauth.clients` capability. */
@ApiTags('Admin')
@ApiCookieAuth('better-auth.session_token')
@ApiExtraModels(AdminOauthClientDto)
@Controller('admin/oauth-clients')
export class AdminOauthClientsController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly clients: OAuthClientService,
  ) {}
  @Get()
  @ApiOperation({ summary: '分页列出 OAuth 客户端（oauth.clients）' })
  @ApiOkResponse({ description: '分页列表' })
  async list(
    @Req()
    request: Request,
    @Query('page')
    page?: string,
    @Query('pageSize')
    pageSize?: string,
  ): Promise<AdminOauthClientListResponse> {
    await this.access.requireCapability(request, 'oauth.clients');
    return await this.clients.listClients(Number(page ?? 1), Number(pageSize ?? 20));
  }
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '注册 OAuth 客户端（oauth.clients）',
    description: 'client_secret 明文仅在本次响应中返回一次（库中只存哈希）。',
  })
  @ApiBody({ type: CreateOauthClientDto })
  @ApiOkResponse({ schema: apiSuccessSchema(AdminOauthClientDto) })
  @ApiResponse({ status: 400, description: 'client_id 已存在或参数不合法' })
  async create(
    @Req()
    request: Request,
    @Body()
    body: CreateOauthClientDto,
  ): Promise<AdminOauthClientView> {
    await this.access.requireCapability(request, 'oauth.clients');
    return await this.clients.createClient(body);
  }
  @Patch(':clientId')
  @ApiOperation({ summary: '更新 OAuth 客户端（oauth.clients）' })
  @ApiParam({ name: 'clientId' })
  @ApiBody({ type: UpdateOauthClientDto })
  @ApiOkResponse({ schema: apiSuccessSchema(AdminOauthClientDto) })
  async update(
    @Req()
    request: Request,
    @Param('clientId')
    clientId: string,
    @Body()
    body: UpdateOauthClientDto,
  ): Promise<AdminOauthClientView> {
    await this.access.requireCapability(request, 'oauth.clients');
    return await this.clients.updateClient(clientId, body);
  }
  @Post(':clientId/secret/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '重置 client_secret（oauth.clients）',
    description: '新密钥明文仅本次返回；旧密钥立即失效。',
  })
  @ApiParam({ name: 'clientId' })
  @ApiOkResponse({ schema: apiSuccessSchema(AdminOauthClientDto) })
  async resetSecret(
    @Req()
    request: Request,
    @Param('clientId')
    clientId: string,
  ): Promise<AdminOauthClientView> {
    await this.access.requireCapability(request, 'oauth.clients');
    return await this.clients.resetClientSecret(clientId);
  }
  @Delete(':clientId')
  @ApiOperation({
    summary: '删除 OAuth 客户端（oauth.clients）',
    description: '同时吊销其全部令牌并清除记住的授权。',
  })
  @ApiParam({ name: 'clientId' })
  @ApiOkResponse({ schema: { type: 'object' } })
  async remove(
    @Req()
    request: Request,
    @Param('clientId')
    clientId: string,
  ): Promise<{ revokedTokens: number }> {
    await this.access.requireCapability(request, 'oauth.clients');
    return { revokedTokens: await this.clients.deleteClient(clientId) };
  }
}
