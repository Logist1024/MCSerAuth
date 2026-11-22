import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ForumUploadResponse } from '@mcserauth/shared';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp, { type Metadata } from 'sharp';
import { UploadQuotaService } from '../../common/services/upload-quota.service.js';
import { AppConfigService } from '../../config/app-config.service.js';
export const MAX_FORUM_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_FORUM_UPLOADS_PER_DAY = 100;
const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};
const FILENAME_PATTERN = /^[a-f0-9]{64}\.(png|jpg|webp|gif)$/;
/** Post image uploads: validated, content-addressed and served publicly. */
@Injectable()
export class ForumUploadService {
  constructor(
    private readonly config: AppConfigService,
    private readonly quota: UploadQuotaService,
  ) {}
  async upload(
    file: Express.Multer.File | undefined,
    userId: string,
  ): Promise<ForumUploadResponse> {
    const buffer = file?.buffer;
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('缺少图片文件（multipart 字段 file）');
    }
    if (buffer.length > MAX_FORUM_UPLOAD_BYTES) {
      throw new BadRequestException(`图片不得超过 ${MAX_FORUM_UPLOAD_BYTES / 1024 / 1024} MiB`);
    }
    let metadata: Metadata;
    try {
      metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: 40000000 }).metadata();
    } catch {
      throw new BadRequestException('无法解析图片文件');
    }
    const format = metadata.format;
    if (format !== 'png' && format !== 'jpeg' && format !== 'webp' && format !== 'gif') {
      throw new BadRequestException('仅支持 PNG / JPEG / WebP / GIF');
    }
    if (format === 'gif' && (metadata.pages ?? 1) > 100) {
      throw new BadRequestException('GIF 帧数过多（最多 100 帧）');
    }
    await this.quota.consume(userId, 'forum_image', MAX_FORUM_UPLOADS_PER_DAY);
    try {
      const extension = format === 'jpeg' ? 'jpg' : format;
      const digest = createHash('sha256').update(buffer).digest('hex');
      const filename = `${digest}.${extension}`;
      const relativePath = path.posix.join('forum', filename);
      await this.writeFile(relativePath, buffer);
      const url = `${this.config.authUrl.replace(/\/+$/, '')}/api/forum/uploads/${filename}`;
      return { url, markdown: `![image](${url})` };
    } catch (error) {
      await this.quota.release(userId, 'forum_image').catch(() => undefined);
      throw error;
    }
  }
  async read(filename: string): Promise<{
    data: Buffer;
    contentType: string;
  }> {
    if (!FILENAME_PATTERN.test(filename)) {
      throw new NotFoundException('图片不存在');
    }
    const absolutePath = path.resolve(this.config.uploadDir, 'forum', filename);
    let data: Buffer;
    try {
      data = await fs.readFile(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('图片不存在');
      }
      throw error;
    }
    const extension = filename.slice(filename.lastIndexOf('.') + 1);
    return {
      data,
      contentType: CONTENT_TYPES[extension] ?? 'application/octet-stream',
    };
  }
  private async writeFile(relativePath: string, buffer: Buffer): Promise<void> {
    const root = path.resolve(this.config.uploadDir);
    const absolutePath = path.resolve(root, relativePath);
    if (!absolutePath.startsWith(`${root}${path.sep}`)) {
      throw new BadRequestException('上传路径不合法');
    }
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    try {
      await fs.writeFile(absolutePath, buffer, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }
}
