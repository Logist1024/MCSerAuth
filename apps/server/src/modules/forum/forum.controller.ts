import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type {
  ForumCategory,
  ForumPostDetail,
  ForumPostSummary,
  ForumReply,
  Paginated,
  VoteResponse,
} from '@mcserauth/shared';
import type { Request } from 'express';
import { AccountAccessService } from '../auth/account-access.service.js';
import {
  CreatePostDto,
  CreateReplyDto,
  CreateReportDto,
  ForumPostDetailQueryDto,
  ForumPostListQueryDto,
  UpdatePostDto,
} from './dto/forum.dto.js';
import { ForumService } from './forum.service.js';
/** Public forum reads plus authenticated posting, replies, votes and reports. */
@ApiTags('Forum')
@UseGuards(ThrottlerGuard)
@Controller('forum')
export class ForumController {
  constructor(
    private readonly accounts: AccountAccessService,
    private readonly forum: ForumService,
  ) {}
  @Get('categories')
  @SkipThrottle()
  @Header('Cache-Control', 'public, max-age=15, stale-while-revalidate=30')
  @ApiOperation({ summary: '版块树（含帖子数与最近活动）' })
  @ApiOkResponse({ description: '统一封装：data 为版块树' })
  async categories(): Promise<ForumCategory[]> {
    return this.forum.listCategories();
  }
  @Get('posts')
  @SkipThrottle()
  @Header('Cache-Control', 'public, max-age=15, stale-while-revalidate=30')
  @ApiOperation({ summary: '帖子列表（分页、置顶优先）' })
  async posts(
    @Query()
    query: ForumPostListQueryDto,
    @Req()
    _request: Request,
  ): Promise<Paginated<ForumPostSummary>> {
    return await this.forum.listPosts(query);
  }
  @Get('posts/:id')
  @SkipThrottle()
  @ApiOperation({ summary: '帖子详情与回帖' })
  @ApiParam({ name: 'id', example: 1 })
  async post(
    @Param('id', ParseIntPipe)
    id: number,
    @Query()
    query: ForumPostDetailQueryDto,
    @Req()
    request: Request,
  ): Promise<ForumPostDetail> {
    const viewer = await this.accounts.getOptionalUser(request);
    return await this.forum.getPost(id, viewer, query);
  }
  @Post('posts')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: '发帖（需登录且未被论坛封禁）' })
  @ApiBody({ type: CreatePostDto })
  async createPost(
    @Req()
    request: Request,
    @Body()
    body: CreatePostDto,
  ): Promise<ForumPostDetail> {
    const user = await this.accounts.requireWritableUser(request);
    return await this.forum.createPost(user, body);
  }
  @Patch('posts/:id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: '编辑自己的帖子' })
  @ApiBody({ type: UpdatePostDto })
  async updatePost(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
    @Body()
    body: UpdatePostDto,
  ): Promise<ForumPostDetail> {
    const user = await this.accounts.requireWritableUser(request);
    return await this.forum.updatePost(user, id, body);
  }
  @Delete('posts/:id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: '删除自己的帖子（版主可删任意帖）' })
  async deletePost(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
  ): Promise<{
    deleted: true;
  }> {
    const user = await this.accounts.requireWritableUser(request);
    await this.forum.deletePost(user, id);
    return { deleted: true };
  }
  @Post('posts/:id/replies')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: '回帖（锁定帖仅版主可回复）' })
  @ApiBody({ type: CreateReplyDto })
  async createReply(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
    @Body()
    body: CreateReplyDto,
  ): Promise<ForumReply> {
    const user = await this.accounts.requireWritableUser(request);
    return this.forum.createReply(user, id, body.contentMd);
  }
  @Patch('replies/:id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: '编辑自己的回复' })
  @ApiBody({ type: CreateReplyDto })
  async updateReply(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
    @Body()
    body: CreateReplyDto,
  ): Promise<ForumReply> {
    const user = await this.accounts.requireWritableUser(request);
    return await this.forum.updateReply(user, id, body.contentMd);
  }
  @Delete('replies/:id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: '删除自己的回复（版主可删任意回复）' })
  async deleteReply(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
  ): Promise<{
    deleted: true;
  }> {
    const user = await this.accounts.requireWritableUser(request);
    await this.forum.deleteReply(user, id);
    return { deleted: true };
  }
  @Post('posts/:id/vote')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: '点赞/取消点赞帖子' })
  async votePost(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
  ): Promise<VoteResponse> {
    const user = await this.accounts.requireWritableUser(request);
    return await this.forum.toggleVote(user, 'post', id);
  }
  @Post('replies/:id/vote')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: '点赞/取消点赞回复' })
  async voteReply(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
  ): Promise<VoteResponse> {
    const user = await this.accounts.requireWritableUser(request);
    return await this.forum.toggleVote(user, 'reply', id);
  }
  @Post('reports')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: '举报帖子/回复/用户/纹理' })
  @ApiBody({ type: CreateReportDto })
  async report(
    @Req()
    request: Request,
    @Body()
    body: CreateReportDto,
  ): Promise<{
    id: number;
  }> {
    const user = await this.accounts.requireWritableUser(request);
    return await this.forum.createReport(user, body);
  }
}
