import {
  Body,
  Controller,
  Delete,
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
  AdminCategory,
  AdminReport,
  AdminStats,
  AdminUserSummary,
  CreateAnnouncementResponse,
  ModeratePostResponse,
  ModerateReplyResponse,
  Paginated,
} from '@mcserauth/shared';
import type { Request } from 'express';
import { AdminAccessService } from './admin-access.service.js';
import { AdminForumService } from './admin-forum.service.js';
import {
  AdminCategoryDto,
  AdminReportListQueryDto,
  AdminUserListQueryDto,
  BanUserDto,
  CreateAnnouncementDto,
  HandleReportDto,
  ModeratePostDto,
  ModerateReplyDto,
  MuteUserDto,
  UnbanUserDto,
  UnmuteUserDto,
  UpdateAdminCategoryDto,
} from './dto/admin-forum.dto.js';
/** Forum moderation, user management, categories and announcements. */
@ApiTags('Admin')
@ApiCookieAuth('better-auth.session_token')
@Controller('admin/forum')
export class AdminForumController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly admin: AdminForumService,
  ) {}
  @Get('stats')
  @ApiOperation({ summary: '运营数据概览（reviewer/admin/superadmin）' })
  async stats(
    @Req()
    request: Request,
  ): Promise<AdminStats> {
    await this.access.requireAtLeast(request, 'reviewer');
    return this.admin.stats();
  }
  @Get('users')
  @ApiOperation({ summary: '用户列表/搜索（reviewer 起）' })
  async users(
    @Req()
    request: Request,
    @Query()
    query: AdminUserListQueryDto,
  ): Promise<Paginated<AdminUserSummary>> {
    await this.access.requireAtLeast(request, 'reviewer');
    return await this.admin.listUsers(query);
  }
  @Post('users/:id/ban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '封禁用户（默认论坛+游戏，admin 起）' })
  @ApiBody({ type: BanUserDto })
  async ban(
    @Req()
    request: Request,
    @Param('id')
    id: string,
    @Body()
    body: BanUserDto,
  ): Promise<AdminUserSummary> {
    const actor = await this.access.requireCapabilityOrRole(request, 'users.ban', 'admin');
    return await this.admin.banUser(actor, id, body);
  }
  @Post('users/:id/unban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '解封用户（admin 起）' })
  @ApiBody({ type: UnbanUserDto })
  async unban(
    @Req()
    request: Request,
    @Param('id')
    id: string,
    @Body()
    body: UnbanUserDto,
  ): Promise<AdminUserSummary> {
    const actor = await this.access.requireCapabilityOrRole(request, 'users.ban', 'admin');
    return await this.admin.unbanUser(actor, id, body);
  }
  @Post('users/:id/mute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '禁言用户（reviewer 起，1–720 小时）' })
  @ApiBody({ type: MuteUserDto })
  async mute(
    @Req()
    request: Request,
    @Param('id')
    id: string,
    @Body()
    body: MuteUserDto,
  ): Promise<AdminUserSummary> {
    const actor = await this.access.requireAtLeast(request, 'reviewer');
    return await this.admin.muteUser(actor, id, body);
  }
  @Post('users/:id/unmute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '解除禁言（reviewer 起）' })
  @ApiBody({ type: UnmuteUserDto })
  async unmute(
    @Req()
    request: Request,
    @Param('id')
    id: string,
    @Body()
    body: UnmuteUserDto,
  ): Promise<AdminUserSummary> {
    const actor = await this.access.requireAtLeast(request, 'reviewer');
    return await this.admin.unmuteUser(actor, id, body);
  }
  @Get('reports')
  @ApiOperation({ summary: '举报队列（默认 pending，reviewer 起）' })
  async reports(
    @Req()
    request: Request,
    @Query()
    query: AdminReportListQueryDto,
  ): Promise<Paginated<AdminReport>> {
    await this.access.requireAtLeast(request, 'reviewer');
    return await this.admin.listReports(query);
  }
  @Post('reports/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '举报标记为已处理（reviewer 起）' })
  @ApiBody({ type: HandleReportDto })
  async resolveReport(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
    @Body()
    body: HandleReportDto,
  ): Promise<AdminReport> {
    const actor = await this.access.requireAtLeast(request, 'reviewer');
    return await this.admin.handleReport(actor, id, 'resolved', body);
  }
  @Post('reports/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '驳回举报（reviewer 起）' })
  @ApiBody({ type: HandleReportDto })
  async rejectReport(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
    @Body()
    body: HandleReportDto,
  ): Promise<AdminReport> {
    const actor = await this.access.requireAtLeast(request, 'reviewer');
    return await this.admin.handleReport(actor, id, 'rejected', body);
  }
  @Patch('posts/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '帖子审核/置顶/加精/锁定（reviewer 起）' })
  @ApiBody({ type: ModeratePostDto })
  async moderatePost(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
    @Body()
    body: ModeratePostDto,
  ): Promise<ModeratePostResponse> {
    const actor = await this.access.requireAtLeast(request, 'reviewer');
    return this.admin.moderatePost(actor, id, body);
  }
  @Patch('replies/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '回复隐藏/恢复/删除（reviewer 起）' })
  @ApiBody({ type: ModerateReplyDto })
  async moderateReply(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
    @Body()
    body: ModerateReplyDto,
  ): Promise<ModerateReplyResponse> {
    const actor = await this.access.requireAtLeast(request, 'reviewer');
    return this.admin.moderateReply(actor, id, body);
  }
  @Get('categories')
  @ApiOperation({ summary: '版块管理列表（forum.categories）' })
  async categories(
    @Req()
    request: Request,
  ): Promise<AdminCategory[]> {
    await this.access.requireCapability(request, 'forum.categories');
    return await this.admin.listCategories();
  }
  @Post('categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '新建版块（forum.categories）' })
  @ApiBody({ type: AdminCategoryDto })
  async createCategory(
    @Req()
    request: Request,
    @Body()
    body: AdminCategoryDto,
  ): Promise<AdminCategory> {
    const actor = await this.access.requireCapability(request, 'forum.categories');
    return await this.admin.createCategory(actor, body);
  }
  @Patch('categories/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新版块（forum.categories）' })
  @ApiBody({ type: UpdateAdminCategoryDto })
  async updateCategory(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
    @Body()
    body: UpdateAdminCategoryDto,
  ): Promise<AdminCategory> {
    const actor = await this.access.requireCapability(request, 'forum.categories');
    return await this.admin.updateCategory(actor, id, body);
  }
  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除空版块（forum.categories）' })
  async deleteCategory(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
  ): Promise<{
    deleted: true;
  }> {
    const actor = await this.access.requireCapability(request, 'forum.categories');
    return await this.admin.deleteCategory(actor, id);
  }
  @Post('announcements')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发布全站公告（站内信，forum.announce）' })
  @ApiBody({ type: CreateAnnouncementDto })
  async announce(
    @Req()
    request: Request,
    @Body()
    body: CreateAnnouncementDto,
  ): Promise<CreateAnnouncementResponse> {
    const actor = await this.access.requireCapability(request, 'forum.announce');
    return this.admin.announce(actor, body);
  }
}
