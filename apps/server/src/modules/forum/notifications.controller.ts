import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { NotificationListResponse } from '@mcserauth/shared';
import type { Request } from 'express';
import { AccountAccessService } from '../auth/account-access.service.js';
import { NotificationListQueryDto } from './dto/forum.dto.js';
import { NotificationsService } from './notifications.service.js';

/** Current account's in-site notifications. */
@ApiTags('Forum')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(ThrottlerGuard)
@Controller('forum/notifications')
export class NotificationsController {
  constructor(
    private readonly accounts: AccountAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: '通知列表（分页）与未读数' })
  async list(
    @Req() request: Request,
    @Query() query: NotificationListQueryDto,
  ): Promise<NotificationListResponse> {
    const user = await this.accounts.requireUser(request);
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  @SkipThrottle()
  @ApiOperation({ summary: '未读通知数' })
  async unreadCount(@Req() request: Request): Promise<{ unreadCount: number }> {
    const user = await this.accounts.requireUser(request);
    return { unreadCount: this.notifications.unreadCount(user.id) };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: '全部标记为已读' })
  async readAll(@Req() request: Request): Promise<{ updated: number }> {
    const user = await this.accounts.requireUser(request);
    return { updated: this.notifications.markAllRead(user.id) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: '单条标记为已读' })
  async read(
    @Req() request: Request,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ read: boolean }> {
    const user = await this.accounts.requireUser(request);
    return { read: this.notifications.markRead(user.id, id) };
  }
}
