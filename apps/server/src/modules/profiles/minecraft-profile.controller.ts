import { Controller, Get, NotImplementedException, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ProtocolApi } from '../../common/decorators/protocol-api.decorator.js';
import { ProtocolErrorDto } from '../../common/dto/protocol-error.dto.js';
import { MinecraftProfileResponseDto } from './dto/profiles.dto.js';

const STUB_MESSAGE =
  'M0 stub: texture endpoints are implemented in M2 (sharp validation + review queue)';

/** Skin/cape distribution endpoints (M0 stubs). */
@ApiTags('Commons-Designs / Textures')
@ProtocolApi()
@Controller('minecraft/profile')
export class MinecraftProfileController {
  @Get('skins')
  @ApiOperation({
    summary: '查询当前皮肤（M0 stub）',
    description: 'M0 返回 501；M2 返回 MinecraftProfileResponse。',
  })
  @ApiOkResponse({ type: MinecraftProfileResponseDto, description: 'M2 目标响应（M0 不返回）' })
  @ApiResponse({ status: 501, type: ProtocolErrorDto })
  getSkins(): never {
    throw new NotImplementedException(STUB_MESSAGE);
  }

  @Post('skins')
  @ApiOperation({
    summary: '上传/设置皮肤（M0 stub）',
    description: 'M0 返回 501；M2 用 sharp 校验 64×32 / 64×64 后进入审核队列。',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['variant', 'file'],
      properties: {
        variant: { type: 'string', enum: ['classic', 'slim'] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 501, type: ProtocolErrorDto })
  uploadSkin(): never {
    throw new NotImplementedException(STUB_MESSAGE);
  }

  @Get('capes')
  @ApiOperation({
    summary: '查询当前披风（M0 stub）',
    description: 'M0 返回 501；M2 返回 MinecraftProfileResponse。',
  })
  @ApiOkResponse({ type: MinecraftProfileResponseDto, description: 'M2 目标响应（M0 不返回）' })
  @ApiResponse({ status: 501, type: ProtocolErrorDto })
  getCapes(): never {
    throw new NotImplementedException(STUB_MESSAGE);
  }

  @Post('capes')
  @ApiOperation({
    summary: '上传/设置披风（M0 stub）',
    description: 'M0 返回 501；M2 用 sharp 校验 64×32 后进入审核队列。',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 501, type: ProtocolErrorDto })
  uploadCape(): never {
    throw new NotImplementedException(STUB_MESSAGE);
  }
}
