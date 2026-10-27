import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { ForumUploadResponse } from '@mcserauth/shared';
import type { Request, Response } from 'express';
import { AccountAccessService } from '../auth/account-access.service.js';
import { ForumUploadService, MAX_FORUM_UPLOAD_BYTES } from './forum-upload.service.js';
/** Markdown image upload + public content-addressed delivery. */
@ApiTags('Forum')
@UseGuards(ThrottlerGuard)
@Controller('forum/uploads')
export class ForumUploadsController {
  constructor(
    private readonly accounts: AccountAccessService,
    private readonly uploads: ForumUploadService,
  ) {}
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FORUM_UPLOAD_BYTES, files: 1 } }),
  )
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: '上传帖子图片（PNG/JPEG/WebP/GIF，≤5 MiB）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async upload(
    @Req()
    request: Request,
    @UploadedFile()
    file: Express.Multer.File | undefined,
  ): Promise<ForumUploadResponse> {
    const user = await this.accounts.requireWritableUser(request);
    return await this.uploads.upload(file, user.id);
  }
  @Get(':filename')
  @SkipThrottle()
  @ApiProduces('image/png', 'image/jpeg', 'image/webp', 'image/gif')
  @ApiOperation({ summary: '读取已上传的帖子图片' })
  @ApiParam({ name: 'filename', example: '<sha256>.png' })
  @ApiResponse({ status: 200, description: '图片' })
  get(
    @Param('filename')
    filename: string,
    @Res()
    response: Response,
  ): void {
    const file = this.uploads.read(filename);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.status(HttpStatus.OK).send(file.data);
  }
}
