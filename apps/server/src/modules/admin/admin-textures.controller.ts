import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { apiSuccessArraySchema, apiSuccessSchema } from '../../common/swagger/api-envelope.js';
import { TextureService, type TextureReviewView } from '../profiles/texture.service.js';
import { AdminAccessService } from './admin-access.service.js';
import { AdminTextureDto, ListTexturesQueryDto, ReviewTextureDto } from './dto/admin.dto.js';
/** Texture review queue — moderators and admins. */
@ApiTags('Admin')
@ApiCookieAuth('better-auth.session_token')
@ApiExtraModels(AdminTextureDto)
@Controller('admin/textures')
export class AdminTexturesController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly textures: TextureService,
  ) {}
  @Get()
  @ApiOperation({
    summary: '列出纹理（reviewer 起）',
    description: '默认返回全部状态；上传即生效，保留驳回/下架用于违规处理。',
  })
  @ApiOkResponse({ schema: apiSuccessArraySchema(AdminTextureDto) })
  async list(
    @Req()
    request: Request,
    @Query()
    query: ListTexturesQueryDto,
  ): Promise<AdminTextureDto[]> {
    await this.access.requireAtLeast(request, 'reviewer');
    return (await this.textures.listForReview(query.status, query.kind)).map((view) =>
      this.toDto(view),
    );
  }
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '恢复纹理（reviewer 起）',
    description: '恢复后该纹理成为对应类型的当前纹理，并写入 moderation_log。',
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiBody({ type: ReviewTextureDto, required: false })
  @ApiOkResponse({ schema: apiSuccessSchema(AdminTextureDto) })
  async approve(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
    @Body()
    body: ReviewTextureDto,
  ): Promise<AdminTextureDto> {
    const actor = await this.access.requireAtLeast(request, 'reviewer');
    return this.toDto(await this.textures.approve(id, actor.userId, body?.reason));
  }
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '下架纹理（reviewer 起）' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiBody({ type: ReviewTextureDto, required: false })
  @ApiOkResponse({ schema: apiSuccessSchema(AdminTextureDto) })
  async reject(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
    @Body()
    body: ReviewTextureDto,
  ): Promise<AdminTextureDto> {
    const actor = await this.access.requireAtLeast(request, 'reviewer');
    return this.toDto(await this.textures.reject(id, actor.userId, body?.reason));
  }
  private toDto(view: TextureReviewView): AdminTextureDto {
    return {
      id: view.id,
      playerUuid: view.playerUuid,
      nickname: view.nickname,
      kind: view.kind,
      variant: view.variant,
      status: view.status,
      isActive: view.isActive,
      uploadedAt: view.uploadedAt.toISOString(),
      url: view.url,
    };
  }
}
