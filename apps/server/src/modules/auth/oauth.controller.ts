import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {
  OAuthAvailabilityResponse,
  OAuthEntryQuery,
  OAuthTokenResponse,
} from '@mcserauth/shared';
import type { Request, Response } from 'express';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuthService } from './auth.service.js';
import {
  OAuthAuthenticateRequestDto,
  OAuthAvailabilityResponseDto,
  OAuthEntryConsentDto,
  OAuthEntryQueryDto,
  OAuthRefreshRequestDto,
  OAuthTokenResponseDto,
} from './dto/oauth.dto.js';
import {
  renderEntryConsentPage,
  renderEntryLoginPage,
  type ConsentPageContext,
} from './entry-page.js';
import type { RequestMeta } from './oauth.service.js';
import { OAuthService } from './oauth.service.js';
import { isAllowedRedirectUri } from './oauth.util.js';

function requestMeta(request: Request): RequestMeta {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  };
}

/**
 * Commons-Designs OAuth-style endpoints.
 *
 * The authorization page is rendered by NestJS (project decision A3) so it
 * shares the better-auth cookie with the website. Launchers then exchange the
 * one-time code for an access/refresh pair.
 */
@ApiTags('Commons-Designs / OAuth')
@ProtocolApi()
@UseGuards(ThrottlerGuard)
@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
    private readonly config: AppConfigService,
  ) {}

  @Get('availability')
  @ApiOperation({
    summary: '授权页可用性检查',
    description: '服务可达时返回 available=true，供启动器做连通性检查。',
  })
  @ApiOkResponse({ type: OAuthAvailabilityResponseDto })
  getAvailability(): OAuthAvailabilityResponse {
    return { available: true };
  }

  @Get('entry')
  @ApiOperation({
    summary: '启动器跳转的授权页',
    description:
      '未登录时渲染登录表单；已登录时渲染授权确认页。页面由 NestJS 直出，复用 better-auth Cookie。',
  })
  @ApiOkResponse({
    description: 'HTML 登录页或授权确认页',
    content: { 'text/html': { schema: { type: 'string' } } },
  })
  async getEntry(
    @Query() query: OAuthEntryQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const session = await this.auth.getSession(request.headers);

    if (!session) {
      const html = renderEntryLoginPage({ appUrl: this.config.appUrl, query });
      response.setHeader('Cache-Control', 'no-store');
      response.status(HttpStatus.OK).type('html').send(html);
      return;
    }

    const player = this.oauth.getPlayerForUser(session.user.id);
    const context: ConsentPageContext = {
      appUrl: this.config.appUrl,
      query: { ...query, redirect_uri: query.redirect_uri ?? '' },
      account: { name: session.user.name, email: session.user.email },
      player: player
        ? { nickname: player.nickname, uuid: player.uuid, banned: player.banned }
        : null,
      redirectUriError: this.describeAuthorizationProblem(query),
    };
    const html = renderEntryConsentPage(context);
    response.setHeader('Cache-Control', 'no-store');
    response.status(HttpStatus.OK).type('html').send(html);
  }

  @Post('entry')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: '提交授权确认',
    description:
      '校验网站会话、redirect_uri 与 PKCE 参数，签发一次性授权码并 302 回跳 redirect_uri。',
  })
  @ApiBody({ type: OAuthEntryConsentDto })
  @ApiConsumes('application/json', 'application/x-www-form-urlencoded')
  @ApiResponse({ status: HttpStatus.FOUND, description: '携带 code 与 state 回跳 redirect_uri' })
  @ApiResponse({ status: 400, type: ProtocolErrorDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  async approveEntry(
    @Body() body: OAuthEntryConsentDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    this.oauth.assertTrustedOrigin(
      request.headers.origin ?? request.headers.referer,
      this.config.isProduction,
    );

    const session = await this.auth.getSession(request.headers);
    if (!session) {
      throw new UnauthorizedException('未登录或登录已失效');
    }
    // Fail early on the consent page instead of at token-exchange time.
    this.oauth.assertUserCanAuthorize(session.user.id);
    if (!isAllowedRedirectUri(body.redirect_uri)) {
      throw new BadRequestException(
        'redirect_uri 不合法：仅允许 HTTPS 或本机（localhost/127.0.0.1）HTTP 地址',
      );
    }
    this.oauth.validatePkceInput(body.code_challenge, body.code_challenge_method);

    const code = this.oauth.createAuthorizationCode({
      userId: session.user.id,
      clientId: body.client_id,
      redirectUri: body.redirect_uri,
      scope: body.scope,
      codeChallenge: body.code_challenge,
      codeChallengeMethod: body.code_challenge_method,
    });

    const redirect = new URL(body.redirect_uri);
    redirect.searchParams.set('code', code);
    if (body.state !== undefined && body.state !== '') {
      redirect.searchParams.set('state', body.state);
    }
    response.redirect(HttpStatus.FOUND, redirect.toString());
  }

  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: '授权码换取访问令牌',
    description:
      '使用一次性 code（或同义字段 token）换取 Bearer 访问令牌与刷新令牌；支持 PKCE code_verifier。',
  })
  @ApiBody({ type: OAuthAuthenticateRequestDto })
  @ApiOkResponse({ type: OAuthTokenResponseDto })
  @ApiResponse({ status: 400, type: ProtocolErrorDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  authenticate(
    @Body() body: OAuthAuthenticateRequestDto,
    @Req() request: Request,
  ): OAuthTokenResponse {
    return this.oauth.exchangeAuthorizationCode(body, requestMeta(request));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: '刷新访问令牌',
    description: '刷新令牌轮换：成功后旧 access/refresh 令牌立即失效。',
  })
  @ApiBody({ type: OAuthRefreshRequestDto })
  @ApiOkResponse({ type: OAuthTokenResponseDto })
  @ApiResponse({ status: 400, type: ProtocolErrorDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  refresh(@Body() body: OAuthRefreshRequestDto, @Req() request: Request): OAuthTokenResponse {
    return this.oauth.refreshAccessToken(body.refresh_token, requestMeta(request));
  }

  private describeAuthorizationProblem(query: OAuthEntryQuery): string | undefined {
    if (query.redirect_uri === undefined || query.redirect_uri === '') {
      return '缺少 redirect_uri，无法把授权码送回启动器。';
    }
    if (!isAllowedRedirectUri(query.redirect_uri)) {
      return 'redirect_uri 不合法：仅允许 HTTPS 或本机（localhost/127.0.0.1）HTTP 地址。';
    }
    if (query.response_type !== undefined && query.response_type !== 'code') {
      return '仅支持 response_type=code。';
    }
    return undefined;
  }
}
