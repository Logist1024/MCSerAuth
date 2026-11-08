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
  ActivateTextureResponse,
  DeleteTextureResponse,
  RenamePlayerResponse,
  UserAuthorizationView,
  UserSettingsResponse,
} from '@mcserauth/shared';
import type { Request } from 'express';
import { AccountAccessService } from '../auth/account-access.service.js';
import { OAuthClientService } from '../auth/oauth-client.service.js';
import { RenamePlayerDto, UpdateProfileDto, ChangeEmailDto } from './dto/user.dto.js';
import { UserService } from './user.service.js';
/** Current account profile: avatar/signature, rename and textures. */
@ApiTags('User')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(ThrottlerGuard)
@Controller('user')
export class UserController {
  constructor(
    private readonly accounts: AccountAccessService,
    private readonly users: UserService,
    private readonly oauthClients: OAuthClientService,
  ) {}
  @Get('settings')
  @SkipThrottle()
  @ApiOperation({ summary: '当前账号资料、玩家与改名冷却' })
  async getSettings(
    @Req()
    request: Request,
  ): Promise<UserSettingsResponse> {
    const user = await this.accounts.requireUser(request);
    return await this.users.getSettings(user.id);
  }
  @Patch('settings')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '更新头像与签名' })
  @ApiBody({ type: UpdateProfileDto })
  async updateSettings(
    @Req()
    request: Request,
    @Body()
    body: UpdateProfileDto,
  ): Promise<UserSettingsResponse> {
    const user = await this.accounts.requireUser(request);
    return await this.users.updateProfile(user.id, body);
  }
  @Post('email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({
    summary: '修改账号邮箱（需当前密码）',
    description: '新邮箱必须未被其他账号使用；成功后启动器同样用新邮箱外置登录。',
  })
  @ApiBody({ type: ChangeEmailDto })
  async changeEmail(
    @Req()
    request: Request,
    @Body()
    body: ChangeEmailDto,
  ): Promise<UserSettingsResponse> {
    const user = await this.accounts.requireUser(request);
    return await this.users.changeEmail(user.id, body);
  }
  @Post('player/rename')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({
    summary: '玩家改名（30 天冷却；旧名保留 30 天）',
    description: '仅游戏昵称变化，UUID 不变；旧名在冷却期内仅保留给原玩家。',
  })
  @ApiBody({ type: RenamePlayerDto })
  async renamePlayer(
    @Req()
    request: Request,
    @Body()
    body: RenamePlayerDto,
  ): Promise<RenamePlayerResponse> {
    const user = await this.accounts.requireUser(request);
    return await this.users.renamePlayer(user.id, body.nickname);
  }
  @Post('textures/:id/activate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '切换当前皮肤/披风' })
  @ApiParam({ name: 'id', example: 1 })
  async activateTexture(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
  ): Promise<ActivateTextureResponse> {
    const user = await this.accounts.requireUser(request);
    return this.users.activateTexture(user.id, id);
  }
  @Delete('textures/:id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: '删除自己的纹理',
    description: '删除当前生效的纹理后，游戏内回退到默认形象。',
  })
  @ApiParam({ name: 'id', example: 1 })
  async deleteTexture(
    @Req()
    request: Request,
    @Param('id', ParseIntPipe)
    id: number,
  ): Promise<DeleteTextureResponse> {
    const user = await this.accounts.requireUser(request);
    return this.users.deleteTexture(user.id, id);
  }
  @Get('oauth/authorizations')
  @SkipThrottle()
  @ApiOperation({
    summary: '我已授权的旗下服务列表',
    description: '来自"记住授权"的记录，含服务名、授权范围与活跃令牌数。',
  })
  async listAuthorizations(@Req() request: Request): Promise<{ items: UserAuthorizationView[] }> {
    const user = await this.accounts.requireUser(request);
    return { items: await this.oauthClients.listConsentsForUser(user.id) };
  }
  @Delete('oauth/authorizations/:clientId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: '撤销对某服务的授权',
    description: '删除记住的授权并立即吊销该服务持有的全部令牌。',
  })
  @ApiParam({ name: 'clientId' })
  async revokeAuthorization(
    @Req()
    request: Request,
    @Param('clientId')
    clientId: string,
  ): Promise<{ revoked: boolean }> {
    const user = await this.accounts.requireUser(request);
    return { revoked: await this.oauthClients.revokeConsent(user.id, clientId, true) };
  }
}
/** Public profile (no email); authenticated users are not required. */
@ApiTags('User')
@Controller('users')
export class PublicUsersController {
  constructor(private readonly users: UserService) {}
  @Get(':id')
  @ApiOperation({ summary: '公开个人主页：统计、当前形象与最近帖子' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: '统一封装：data 为公开档案' })
  async get(
    @Param('id')
    id: string,
  ) {
    return await this.users.getPublicProfile(id);
  }
}
