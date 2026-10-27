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
  Query,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AdminBannerOverview,
  AdminTitleOverview,
  AdjustPointsResponse,
  BannerSummary,
  GrowthRulesResponse,
  TitleApplicationSummary,
  UserTitleSummary,
} from '@mcserauth/shared';
import type { Request } from 'express';
import { AdminAccessService } from './admin-access.service.js';
import { ProgressService } from '../growth/progress.service.js';
import {
  AdjustPointsDto,
  BannerListQueryDto,
  CreateTitleDto,
  GrowthRulesDto,
  TitleUserDto,
} from './dto/admin-growth.dto.js';
/** Staff tools for titles, level-100 applications, banners and point grants. */
@ApiTags('Admin')
@ApiCookieAuth('better-auth.session_token')
@Controller('admin/growth')
export class AdminGrowthController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly progress: ProgressService,
  ) {}
  @Get('titles')
  @ApiOperation({ summary: '称号与申请列表（titles.manage）' })
  async titles(
    @Req()
    request: Request,
  ): Promise<AdminTitleOverview> {
    await this.access.requireCapability(request, 'titles.manage');
    return await this.progress.adminTitleOverview();
  }
  @Post('titles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '新建特别称号（titles.manage）' })
  @ApiBody({ type: CreateTitleDto })
  async createTitle(
    @Req()
    request: Request,
    @Body()
    body: CreateTitleDto,
  ): Promise<UserTitleSummary> {
    const actor = await this.access.requireCapability(request, 'titles.manage');
    return await this.progress.createSpecialTitle(actor.userId, body);
  }
  @Post('titles/:id/grant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '授予用户称号（titles.manage）' })
  @ApiBody({ type: TitleUserDto })
  async grantTitle(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
    @Body()
    body: TitleUserDto,
  ): Promise<{
    granted: true;
  }> {
    const actor = await this.access.requireCapability(request, 'titles.manage');
    await this.progress.grantTitle(actor.userId, id, body.userId);
    return { granted: true };
  }
  @Post('titles/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '收回用户称号（titles.manage）' })
  @ApiBody({ type: TitleUserDto })
  async revokeTitle(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
    @Body()
    body: TitleUserDto,
  ): Promise<{
    revoked: true;
  }> {
    const actor = await this.access.requireCapability(request, 'titles.manage');
    await this.progress.revokeTitle(actor.userId, id, body.userId);
    return { revoked: true };
  }
  @Post('title-applications/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '通过 100 级专属称号申请（titles.manage）' })
  async approveApplication(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
  ): Promise<TitleApplicationSummary> {
    const actor = await this.access.requireCapability(request, 'titles.manage');
    return await this.progress.reviewTitleApplication(actor.userId, id, true);
  }
  @Post('title-applications/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '驳回 100 级专属称号申请（titles.manage）' })
  async rejectApplication(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
  ): Promise<TitleApplicationSummary> {
    const actor = await this.access.requireCapability(request, 'titles.manage');
    return await this.progress.reviewTitleApplication(actor.userId, id, false);
  }
  @Get('banners')
  @ApiOperation({ summary: 'Banner 审核队列（banners.manage）' })
  async banners(
    @Req()
    request: Request,
    @Query()
    query: BannerListQueryDto,
  ): Promise<AdminBannerOverview> {
    await this.access.requireCapability(request, 'banners.manage');
    return await this.progress.adminBanners(query.status);
  }
  @Post('banners/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '通过 Banner（banners.manage）' })
  async approveBanner(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
  ): Promise<BannerSummary> {
    const actor = await this.access.requireCapability(request, 'banners.manage');
    return await this.progress.reviewBanner(actor.userId, id, true);
  }
  @Post('banners/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '驳回 Banner 并退还积分（banners.manage）' })
  async rejectBanner(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
  ): Promise<BannerSummary> {
    const actor = await this.access.requireCapability(request, 'banners.manage');
    return await this.progress.reviewBanner(actor.userId, id, false);
  }
  @Post('users/:id/points')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '调整用户积分（points.adjust）' })
  @ApiBody({ type: AdjustPointsDto })
  async adjustPoints(
    @Req()
    request: Request,
    @Param('id')
    id: string,
    @Body()
    body: AdjustPointsDto,
  ): Promise<AdjustPointsResponse> {
    const actor = await this.access.requireCapability(request, 'points.adjust');
    return await this.progress.adjustPoints(actor.userId, id, body.amount, body.memo);
  }
  @Get('rules')
  @ApiOperation({ summary: '成长规则当前值与默认值（site.manage）' })
  async rules(
    @Req()
    request: Request,
  ): Promise<GrowthRulesResponse> {
    await this.access.requireCapability(request, 'site.manage');
    return await this.progress.rulesView();
  }
  @Patch('rules')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '部分更新成长规则（site.manage）' })
  @ApiBody({ type: GrowthRulesDto })
  async updateRules(
    @Req()
    request: Request,
    @Body()
    body: GrowthRulesDto,
  ): Promise<GrowthRulesResponse> {
    const actor = await this.access.requireCapability(request, 'site.manage');
    return this.progress.updateRules(actor.userId, body);
  }
  @Post('rules/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复默认成长规则（site.manage）' })
  async resetRules(
    @Req()
    request: Request,
  ): Promise<GrowthRulesResponse> {
    const actor = await this.access.requireCapability(request, 'site.manage');
    return this.progress.resetRules(actor.userId);
  }
}
