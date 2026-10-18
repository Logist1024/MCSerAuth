import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import { UserProfilesMeResponseDto } from './dto/oauth.dto.js';

const STUB_MESSAGE = 'M0 stub: current-user profile lookup is implemented in M1';

/** `GET /api/user/profiles/me` — authenticated account + game identity summary. */
@ApiTags('Commons-Designs / User')
@ProtocolApi()
@Controller('user/profiles')
export class UserProfilesController {
  @Get('me')
  @ApiOperation({
    summary: '获取当前用户档案（M0 stub）',
    description: 'M0 返回 501；M1 接入启动器令牌后返回当前账号与 player 摘要。',
  })
  @ApiOkResponse({ type: UserProfilesMeResponseDto, description: 'M1 目标响应（M0 不返回）' })
  @ApiResponse({ status: 501, type: ProtocolErrorDto })
  getMe(): never {
    throw new NotImplementedException(STUB_MESSAGE);
  }
}
