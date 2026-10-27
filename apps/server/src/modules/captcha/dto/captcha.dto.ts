import { ApiPropertyOptional } from '@nestjs/swagger';
import { CAPTCHA_PROVIDERS, type CaptchaProvider } from '@mcserauth/shared';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CaptchaVerifyDto {
  @ApiPropertyOptional({ description: '内置验证码挑战 ID', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @ApiPropertyOptional({ description: '内置验证码答案', maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  answer?: string;

  @ApiPropertyOptional({ description: 'Turnstile/hCaptcha 组件令牌', maxLength: 4096 })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  token?: string;
}

export class UpdateCaptchaDto {
  @ApiPropertyOptional({ description: '是否启用登录/注册人机验证' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: CAPTCHA_PROVIDERS })
  @IsOptional()
  @IsIn(CAPTCHA_PROVIDERS)
  provider?: CaptchaProvider;

  @ApiPropertyOptional({ maxLength: 128, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  siteKey?: string | null;

  @ApiPropertyOptional({
    description: '留空字符串表示清除；写入后不再回显',
    maxLength: 256,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  secret?: string | null;
}
