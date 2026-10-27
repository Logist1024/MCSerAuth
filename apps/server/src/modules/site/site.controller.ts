import { Controller, Get, HttpStatus, Param, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { PublicHomeResponse, SiteDisplaySettings } from '@mcserauth/shared';
import { SiteService } from './site.service.js';

/** Public site configuration used by the rendered layout. */
@ApiTags('Site')
@Controller('site')
export class SiteController {
  constructor(private readonly site: SiteService) {}

  @Get()
  @ApiOperation({ summary: '公开站点展示信息（站名、公告、页脚、图标与自定义 CSS）' })
  @ApiOkResponse({ description: '统一封装：data 为展示配置' })
  get(): SiteDisplaySettings {
    return this.site.getDisplaySettings();
  }

  @Get('home')
  @ApiOperation({ summary: '公开首页内容与正在展示的 Banner' })
  @ApiOkResponse({ description: '统一封装：data 为首页内容与 Banner' })
  home(): PublicHomeResponse {
    return this.site.getHome();
  }

  @Get('icon/:filename')
  @ApiProduces('image/png', 'image/jpeg', 'image/webp', 'image/gif')
  @ApiOperation({ summary: '读取站点图标（浏览器标签页图标与页头品牌）' })
  @ApiParam({ name: 'filename', example: '<sha256>.png' })
  @ApiResponse({ status: 200, description: '图标二进制内容' })
  @ApiResponse({ status: 404, description: '图标不存在' })
  icon(@Param('filename') filename: string, @Res() response: Response): void {
    const file = this.site.readIcon(filename);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.status(HttpStatus.OK).send(file.data);
  }
}
