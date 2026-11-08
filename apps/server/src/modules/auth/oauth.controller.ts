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
import {
  OAUTH_SCOPE_LABELS,
  type OAuthAvailabilityResponse,
  type OAuthEntryQuery,
  type OAuthScope,
  type OAuthTokenResponse,
} from '@mcserauth/shared';
import type { Request, Response } from 'express';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { CSP_NONCE_KEY } from '../../common/csp.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuthService } from './auth.service.js';
import { OAuthClientService } from './oauth-client.service.js';
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
import type { OauthClientRow } from './oauth-client.service.js';
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
 * Entry authorization request, resolved against the client registry:
 * - `legacy`  — no client_id, the historical launcher behaviour.
 * - `client`  — registered and enabled; redirect/scope already validated.
 * - `invalid` — a client_id was provided but failed validation.
 */
type ResolvedEntryClient =
  | { mode: 'legacy' }
  | { mode: 'client'; client: OauthClientRow; scopes: OAuthScope[] }
  | { mode: 'invalid'; problem: string };
/**
 * Commons-Designs OAuth-style endpoints.
 *
 * The authorization page is rendered by NestJS (project decision A3) so it
 * shares the better-auth cookie with the website. Launchers then exchange the
 * one-time code for an access/refresh pair. Registered sibling-service
 * clients additionally get remembered consents for one-click re-login.
 */
@ApiTags('Commons-Designs / OAuth')
@ProtocolApi()
@UseGuards(ThrottlerGuard)
@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
    private readonly clients: OAuthClientService,
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
    summary: '启动器/旗下服务跳转的授权页',
    description:
      '未登录时渲染登录表单；已登录时渲染授权确认页。注册客户端在已记住授权时直接 302 带 code 回跳，免二次确认。',
  })
  @ApiOkResponse({
    description: 'HTML 登录页或授权确认页',
    content: { 'text/html': { schema: { type: 'string' } } },
  })
  async getEntry(
    @Query()
    query: OAuthEntryQueryDto,
    @Req()
    request: Request,
    @Res()
    response: Response,
  ): Promise<void> {
    const session = await this.auth.getSession(request.headers);
    if (!session) {
      const html = renderEntryLoginPage(
        { appUrl: this.config.appUrl, query },
        response.locals[CSP_NONCE_KEY],
      );
      response.setHeader('Cache-Control', 'no-store');
      response.status(HttpStatus.OK).type('html').send(html);
      return;
    }
    const resolved = await this.resolveEntryClient(query);
    // Banned accounts never get a code, not even from a remembered grant; the
    // consent page below renders the reason instead of the confirmation form.
    const authError = await this.oauth.getAuthorizationBlockReason(session.user.id);
    // One-click re-login: a remembered consent covering the requested scopes
    // skips the confirmation page entirely.
    if (resolved.mode === 'client' && authError === null) {
      const consent = await this.clients.findConsent(session.user.id, resolved.client.clientId);
      if (consent && this.clients.consentCovers(consent, resolved.scopes)) {
        await this.issueCodeAndRedirect(response, session.user.id, resolved, query);
        return;
      }
    }
    const player = await this.oauth.getPlayerForUser(session.user.id);
    const problem =
      resolved.mode === 'invalid'
        ? resolved.problem
        : resolved.mode === 'legacy'
          ? this.describeAuthorizationProblem(query)
          : undefined;
    const context: ConsentPageContext = {
      appUrl: this.config.appUrl,
      query: { ...query, redirect_uri: query.redirect_uri ?? '' },
      account: { name: session.user.name, email: session.user.email },
      player: player
        ? { nickname: player.nickname, uuid: player.uuid, banned: player.banned }
        : null,
      redirectUriError: problem,
      authError: authError?.message,
      client:
        resolved.mode === 'client'
          ? {
              name: resolved.client.name,
              scopes: resolved.scopes.map((scope) => ({
                scope,
                label: OAUTH_SCOPE_LABELS[scope],
              })),
            }
          : undefined,
    };
    const html = renderEntryConsentPage(context, response.locals[CSP_NONCE_KEY]);
    response.setHeader('Cache-Control', 'no-store');
    response.status(HttpStatus.OK).type('html').send(html);
  }
  @Post('entry')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: '提交授权确认',
    description:
      '校验网站会话、redirect_uri 与 PKCE 参数，签发一次性授权码并 302 回跳 redirect_uri。注册客户端可勾选记住授权。',
  })
  @ApiBody({ type: OAuthEntryConsentDto })
  @ApiConsumes('application/json', 'application/x-www-form-urlencoded')
  @ApiResponse({ status: HttpStatus.FOUND, description: '携带 code 与 state 回跳 redirect_uri' })
  @ApiResponse({ status: 400, type: ProtocolErrorDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  async approveEntry(
    @Body()
    body: OAuthEntryConsentDto,
    @Req()
    request: Request,
    @Res()
    response: Response,
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
    await this.oauth.assertUserCanAuthorize(session.user.id);
    const resolved = await this.resolveEntryClient(body);
    if (resolved.mode === 'invalid') {
      throw new BadRequestException(resolved.problem);
    }
    if (resolved.mode === 'client') {
      const remember =
        body.remember === 'on' ||
        body.remember === 'true' ||
        body.remember === '1' ||
        body.remember === true;
      if (remember) {
        await this.clients.saveConsent(session.user.id, resolved.client.clientId, resolved.scopes);
      }
    }
    await this.issueCodeAndRedirect(response, session.user.id, resolved, body);
  }
  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: '授权码换取访问令牌',
    description:
      '使用一次性 code（或同义字段 token）换取 Bearer 访问令牌与刷新令牌；支持 PKCE code_verifier；机密客户端需带 client_secret。',
  })
  @ApiBody({ type: OAuthAuthenticateRequestDto })
  @ApiOkResponse({ type: OAuthTokenResponseDto })
  @ApiResponse({ status: 400, type: ProtocolErrorDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  async authenticate(
    @Body()
    body: OAuthAuthenticateRequestDto,
    @Req()
    request: Request,
  ): Promise<OAuthTokenResponse> {
    return await this.oauth.exchangeAuthorizationCode(body, requestMeta(request));
  }
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: '刷新访问令牌',
    description: '刷新令牌轮换：成功后旧 access/refresh 令牌立即失效。',
  })
  @ApiBody({ type: OAuthRefreshRequestDto })
  @ApiOkResponse({ type: OAuthTokenResponseDto })
  @ApiResponse({ status: 400, type: ProtocolErrorDto })
  @ApiResponse({ status: 401, type: ProtocolErrorDto })
  @ApiResponse({ status: 403, type: ProtocolErrorDto })
  async refresh(
    @Body()
    body: OAuthRefreshRequestDto,
    @Req()
    request: Request,
  ): Promise<OAuthTokenResponse> {
    return await this.oauth.refreshAccessToken(body, requestMeta(request));
  }
  /**
   * Validates `client_id`/`redirect_uri`/`scope` for the entry endpoints.
   * Requests without a `client_id` fall through to the legacy launcher path.
   */
  private async resolveEntryClient(
    input: OAuthEntryQuery & { redirect_uri?: string },
  ): Promise<ResolvedEntryClient> {
    if (input.client_id === undefined || input.client_id === '') {
      return { mode: 'legacy' };
    }
    const client = await this.clients.findClient(input.client_id);
    if (!client || !client.enabled) {
      return { mode: 'invalid', problem: 'client_id 未注册或已被停用。' };
    }
    if (
      input.response_type !== undefined &&
      input.response_type !== '' &&
      input.response_type !== 'code'
    ) {
      return { mode: 'invalid', problem: '仅支持 response_type=code。' };
    }
    if (
      input.redirect_uri === undefined ||
      input.redirect_uri === '' ||
      !client.redirectUris.includes(input.redirect_uri)
    ) {
      return { mode: 'invalid', problem: 'redirect_uri 与该客户端注册的回调地址不匹配。' };
    }
    // Public (secret-less) clients have no client authentication to fall back
    // on, so PKCE is mandatory end-to-end (OAuth 2.1 §4.3).
    if (client.clientSecretHash === null && (input.code_challenge ?? '') === '') {
      return {
        mode: 'invalid',
        problem: '公开客户端必须使用 PKCE：请携带 code_challenge（建议 S256）。',
      };
    }
    try {
      const scopes = this.clients.resolveRequestedScopes(client, input.scope);
      return { mode: 'client', client, scopes };
    } catch (error) {
      return {
        mode: 'invalid',
        problem: error instanceof BadRequestException ? error.message : 'scope 校验失败。',
      };
    }
  }
  /** Shared tail of both entry endpoints: PKCE check → code → 302 back. */
  private async issueCodeAndRedirect(
    response: Response,
    userId: string,
    resolved: ResolvedEntryClient,
    input: OAuthEntryQuery & { redirect_uri?: string },
  ): Promise<void> {
    const redirectUri = input.redirect_uri;
    if (redirectUri === undefined || redirectUri === '') {
      throw new BadRequestException('缺少 redirect_uri，无法把授权码送回调用方');
    }
    if (!isAllowedRedirectUri(redirectUri)) {
      throw new BadRequestException(
        'redirect_uri 不合法：仅允许 HTTPS 或本机（localhost/127.0.0.1）HTTP 地址',
      );
    }
    this.oauth.validatePkceInput(input.code_challenge, input.code_challenge_method);
    const code = await this.oauth.createAuthorizationCode({
      userId,
      clientId: resolved.mode === 'client' ? resolved.client.clientId : input.client_id,
      redirectUri: redirectUri,
      // Legacy launchers have no scope registry: forcing null keeps their
      // tokens on the full launcher userinfo view regardless of any stray
      // `scope` parameter they may send.
      scope: resolved.mode === 'client' ? resolved.scopes.join(' ') : undefined,
      codeChallenge: input.code_challenge,
      codeChallengeMethod: input.code_challenge_method,
    });
    const redirect = new URL(redirectUri);
    redirect.searchParams.set('code', code);
    if (input.state !== undefined && input.state !== '') {
      redirect.searchParams.set('state', input.state);
    }
    response.redirect(HttpStatus.FOUND, redirect.toString());
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
