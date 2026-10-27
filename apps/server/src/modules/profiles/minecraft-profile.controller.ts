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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { MinecraftProfileResponse, TextureUploadResponse } from '@mcserauth/shared';
import type { Request, Response } from 'express';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import {
  MinecraftProfileResponseDto,
  SkinUploadMetadataDto,
  TextureUploadResponseDto,
} from './dto/profiles.dto.js';
import { PlayerContextService } from './player-context.service.js';
import { MAX_TEXTURE_BYTES, TextureService } from './texture.service.js';
/**
 * Skin/cape distribution and upload endpoints.
 *
 * Lookups and uploads require the current player (Bearer launcher token or
 * website cookie). Uploads become active immediately; moderators can take down
 * violating textures after the fact.
 */
@ApiTags('Commons-Designs / Textures')
@ProtocolApi()
@Controller('minecraft/profile')
export class MinecraftProfileController {
  constructor(
    private readonly players: PlayerContextService,
    private readonly textures: TextureService,
  ) {}
  @Get('skins')
  @ApiBearerAuth('launcher-token')
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: '查询当前玩家的皮肤与披风',
    description: '返回全部纹理（ACTIVE 标记当前使用），URL 为带签名的短时链接。',
  })
  @ApiOkResponse({ type: MinecraftProfileResponseDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  async getSkins(
    @Req()
    request: Request,
  ): Promise<MinecraftProfileResponse> {
    const actor = await this.players.requirePlayer(request);
    return await this.textures.getTextures(actor.player);
  }
  @Post('skins')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_TEXTURE_BYTES, files: 1 } }))
  @ApiBearerAuth('launcher-token')
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: '上传/设置皮肤',
    description:
      'multipart 上传 PNG（仅原版尺寸 64×32 或 64×64，variant=classic|slim）；上传后立即生效，尺寸/格式非法返回 400。',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['variant', 'file'],
      properties: {
        variant: { type: 'string', enum: ['classic', 'slim'] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: TextureUploadResponseDto })
  @ApiResponse({ status: 400, type: ProtocolErrorDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  async uploadSkin(
    @UploadedFile()
    file: Express.Multer.File | undefined,
    @Body()
    body: SkinUploadMetadataDto,
    @Req()
    request: Request,
  ): Promise<TextureUploadResponse> {
    const actor = await this.players.requirePlayer(request);
    return await this.textures.upload(actor.player, 'skin', file, body.variant);
  }
  @Get('capes')
  @ApiBearerAuth('launcher-token')
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: '查询当前玩家的皮肤与披风',
    description: '与 GET /minecraft/profile/skins 返回相同结构。',
  })
  @ApiOkResponse({ type: MinecraftProfileResponseDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  async getCapes(
    @Req()
    request: Request,
  ): Promise<MinecraftProfileResponse> {
    const actor = await this.players.requirePlayer(request);
    return await this.textures.getTextures(actor.player);
  }
  @Post('capes')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_TEXTURE_BYTES, files: 1 } }))
  @ApiBearerAuth('launcher-token')
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary: '上传/设置披风',
    description: 'multipart 上传 PNG（仅原版尺寸 64×32）；上传后立即生效。',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: TextureUploadResponseDto })
  @ApiResponse({ status: 400, type: ProtocolErrorDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  async uploadCape(
    @UploadedFile()
    file: Express.Multer.File | undefined,
    @Req()
    request: Request,
  ): Promise<TextureUploadResponse> {
    const actor = await this.players.requirePlayer(request);
    return await this.textures.upload(actor.player, 'cape', file, undefined);
  }
  @Get('textures/:id')
  @ApiProduces('image/png')
  @ApiOperation({
    summary: '读取签名纹理文件',
    description: '由签名 URL 直接访问，校验 expires + sig；无需登录，签名即授权。',
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiQuery({ name: 'expires', required: true, example: 1800000000 })
  @ApiQuery({ name: 'sig', required: true })
  @ApiResponse({ status: 200, description: 'PNG 图像', content: { 'image/png': {} } })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  @ApiResponse({ status: 404, type: ProtocolErrorDto })
  getTexture(
    @Param('id', ParseIntPipe)
    id: number,
    @Query('expires')
    expires: string | undefined,
    @Query('sig')
    signature: string | undefined,
    @Res()
    response: Response,
  ): void {
    const data = this.textures.readSignedTexture(id, expires, signature);
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Cache-Control', 'private, max-age=60');
    response.status(HttpStatus.OK).send(data);
  }
}
