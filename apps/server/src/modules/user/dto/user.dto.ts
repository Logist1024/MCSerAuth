import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ChangeEmailRequest,
  RenamePlayerRequest,
  UpdateProfileRequest,
} from '@mcserauth/shared';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class UpdateProfileDto implements UpdateProfileRequest {
  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  signature?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, description: 'http(s) 头像地址' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string | null;
}

export class RenamePlayerDto implements RenamePlayerRequest {
  @ApiProperty({ minLength: 3, maxLength: 16, example: 'NewNick' })
  @IsString()
  @Length(3, 16)
  @Matches(/^[A-Za-z0-9_]+$/, { message: '昵称仅允许字母、数字与下划线（3–16 位）' })
  nickname!: string;
}

export class ChangeEmailDto implements ChangeEmailRequest {
  @ApiProperty({ description: '新邮箱', example: 'someone@example.com', maxLength: 200 })
  @IsEmail({}, { message: '邮箱地址不合法' })
  @MaxLength(200)
  newEmail!: string;

  @ApiProperty({ description: '当前账号密码', minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  currentPassword!: string;
}
