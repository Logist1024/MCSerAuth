import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type {
  BannerSummary,
  CheckinResponse,
  GrowthOverviewResponse,
  LeaderboardEntry,
  PointTransactionPage,
  PurchaseResponse,
  TipResponse,
  TitleApplicationSummary,
  UserTitleSummary,
} from '@mcserauth/shared';
import type { Request } from 'express';
import { AccountAccessService, type AccountUser } from '../auth/account-access.service.js';
import { ProgressService } from './progress.service.js';
import {
  LeaderboardQueryDto,
  PurchaseDto,
  SubmitTitleApplicationDto,
  TipDto,
  TransactionQueryDto,
} from './dto/growth.dto.js';
/** Levels, check-in, points, shop, tips and title applications. */
@ApiTags('Growth')
@ApiCookieAuth('better-auth.session_token')
@Controller('growth')
@UseGuards(ThrottlerGuard)
export class GrowthController {
  constructor(
    private readonly access: AccountAccessService,
    private readonly progress: ProgressService,
  ) {}
  @Get('overview')
  @ApiOperation({ summary: '我的成长概览（等级、积分、商店、榜单、称号）' })
  async overview(
    @Req()
    request: Request,
  ): Promise<GrowthOverviewResponse> {
    const user = await this.requireActive(request);
    return this.progress.overview(user.id);
  }
  @Get('transactions')
  @ApiOperation({ summary: '我的积分流水（分页）' })
  async transactions(
    @Req()
    request: Request,
    @Query()
    query: TransactionQueryDto,
  ): Promise<PointTransactionPage> {
    const user = await this.access.requireUser(request);
    return await this.progress.listTransactions(user.id, query.page, query.pageSize);
  }
  @Post('checkin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: '每日签到（经验 + 积分，连续签到有加成）' })
  async checkin(
    @Req()
    request: Request,
  ): Promise<CheckinResponse> {
    const user = await this.access.requireUser(request);
    return this.progress.checkin(user.id);
  }
  @Post('purchase')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: '积分商店：经验翻倍卡 / 披风解锁 / Banner 位' })
  @ApiBody({ type: PurchaseDto })
  async purchase(
    @Req()
    request: Request,
    @Body()
    body: PurchaseDto,
  ): Promise<PurchaseResponse> {
    const user = await this.requireActive(request);
    return await this.progress.purchase(user.id, body);
  }
  @Post('tips')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '打赏其他用户积分' })
  @ApiBody({ type: TipDto })
  async tip(
    @Req()
    request: Request,
    @Body()
    body: TipDto,
  ): Promise<TipResponse> {
    const user = await this.requireActive(request);
    return await this.progress.tip(user.id, body);
  }
  @Post('title-applications')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: '100 级专属称号申请' })
  @ApiBody({ type: SubmitTitleApplicationDto })
  async applyTitle(
    @Req()
    request: Request,
    @Body()
    body: SubmitTitleApplicationDto,
  ): Promise<TitleApplicationSummary> {
    const user = await this.access.requireUser(request);
    return await this.progress.submitTitleApplication(user.id, body);
  }
  @Get('leaderboard')
  @ApiOperation({ summary: '等级排行榜（拥有称号的用户不参与普通等级榜）' })
  async leaderboard(
    @Query()
    query: LeaderboardQueryDto,
  ): Promise<LeaderboardEntry[]> {
    return await this.progress.leaderboard(query.limit ?? 10);
  }
  @Get('titles')
  @ApiOperation({ summary: '称号目录（公开）' })
  async titles(): Promise<UserTitleSummary[]> {
    return await this.progress.listTitles();
  }
  @Get('banners')
  @ApiOperation({ summary: '首页正在展示的 Banner（公开）' })
  async banners(): Promise<BannerSummary[]> {
    return await this.progress.listActiveBanners();
  }
  private async requireActive(request: Request): Promise<AccountUser> {
    const user = await this.access.requireUser(request);
    if (user.banned) {
      throw new ForbiddenException('该账号已被封禁');
    }
    return user;
  }
}
