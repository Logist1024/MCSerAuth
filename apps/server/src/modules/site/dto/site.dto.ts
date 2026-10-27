import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SITE_CUSTOM_CSS_MAX_LENGTH,
  USER_ROLES,
  type HomeContent,
  type UserRole,
} from '@mcserauth/shared';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AdminSiteUpdateDto {
  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  siteName?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  tagline?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  footerText?: string;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  announcement?: string | null;

  @ApiPropertyOptional({ maxLength: 254, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  contactEmail?: string | null;

  @ApiPropertyOptional({
    maxLength: SITE_CUSTOM_CSS_MAX_LENGTH,
    nullable: true,
    description: '全站自定义 CSS；留空或 null 表示清除',
  })
  @IsOptional()
  @IsString()
  @MaxLength(SITE_CUSTOM_CSS_MAX_LENGTH)
  customCss?: string | null;

  @ApiPropertyOptional({
    type: Object,
    description: '首页可编辑内容（首屏、数据条、加入步骤与入口卡片）',
  })
  @IsOptional()
  @IsObject()
  homeContent?: HomeContent;
}

export class ConsoleSiteUpdateDto extends AdminSiteUpdateDto {
  @ApiPropertyOptional({ enum: ['console', 'smtp', 'resend'] })
  @IsOptional()
  @IsIn(['console', 'smtp', 'resend'])
  mailProvider?: 'console' | 'smtp' | 'resend';

  @ApiPropertyOptional({ maxLength: 254 })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  mailFrom?: string;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpHost?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 65_535 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65_535)
  smtpPort?: number;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpUser?: string | null;

  @ApiPropertyOptional({ description: '留空字符串表示清除已保存的密码', maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  smtpPass?: string | null;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: USER_ROLES })
  @IsIn(USER_ROLES)
  role!: UserRole;
}

export class ConsoleLoginDto {
  @ApiProperty({ minLength: 1, maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  key!: string;
}
