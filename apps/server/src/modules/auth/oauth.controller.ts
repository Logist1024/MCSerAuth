import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { OAuthAvailabilityResponse, OAuthEntryQuery } from '@mcserauth/shared';
import type { Response } from 'express';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import {
  OAuthAuthenticateRequestDto,
  OAuthAvailabilityResponseDto,
  OAuthEntryQueryDto,
  OAuthRefreshRequestDto,
  OAuthTokenResponseDto,
} from './dto/oauth.dto.js';
import { renderEntryPlaceholder } from './entry-page.js';

const STUB_MESSAGE = 'M0 stub: this Commons-Designs endpoint is implemented in M1';

/**
 * Commons-Designs OAuth-style endpoints (M0 stubs).
 *
 * Native protocol payloads only — the unified `{ code, data }` envelope is
 * bypassed via @ProtocolApi. Response shapes are provisional until the
 * official protocol document is reconciled (docs/protocol-checklist.md).
 */
@ApiTags('Commons-Designs / OAuth')
@ProtocolApi()
@Controller('oauth')
export class OAuthController {
  @Get('availability')
  @ApiOperation({
    summary: '授权页可用性检查',
    description: 'M0 恒返回 available=true，用于启动器连通性冒烟。',
  })
  @ApiOkResponse({ type: OAuthAvailabilityResponseDto })
  getAvailability(): OAuthAvailabilityResponse {
    return { available: true };
  }

  @Get('entry')
  @ApiOperation({
    summary: '启动器跳转的授权确认页（M0 占位 HTML）',
    description: 'A3：正式实现在 NestJS 侧直接渲染，与网站登录态同源。',
  })
  @ApiOkResponse({
    description: 'HTML 授权页',
    content: { 'text/html': { schema: { type: 'string' } } },
  })
  getEntry(@Query() query: OAuthEntryQueryDto, @Res() response: Response): void {
    const html = renderEntryPlaceholder(query as OAuthEntryQuery);
    response.status(HttpStatus.OK).type('html').send(html);
  }

  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '授权码/令牌换取访问令牌（M0 stub）',
    description: 'M0 返回 501；M1 实现后返回 OAuthTokenResponse。',
  })
  @ApiBody({ type: OAuthAuthenticateRequestDto })
  @ApiOkResponse({ type: OAuthTokenResponseDto, description: 'M1 目标响应（M0 不返回）' })
  @ApiResponse({ status: HttpStatus.NOT_IMPLEMENTED, type: ProtocolErrorDto })
  authenticate(@Body() _body: OAuthAuthenticateRequestDto): never {
    throw new NotImplementedException(STUB_MESSAGE);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '刷新访问令牌（M0 stub）',
    description: 'M0 返回 501；M1 实现后返回 OAuthTokenResponse。',
  })
  @ApiBody({ type: OAuthRefreshRequestDto })
  @ApiOkResponse({ type: OAuthTokenResponseDto, description: 'M1 目标响应（M0 不返回）' })
  @ApiResponse({ status: HttpStatus.NOT_IMPLEMENTED, type: ProtocolErrorDto })
  refresh(@Body() _body: OAuthRefreshRequestDto): never {
    throw new NotImplementedException(STUB_MESSAGE);
  }
}
