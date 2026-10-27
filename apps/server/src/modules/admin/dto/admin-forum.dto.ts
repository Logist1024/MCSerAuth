import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  POST_STATUSES,
  REPORT_STATUSES,
  REPLY_STATUSES,
  type AdminCategoryInput,
  type BanUserRequest,
  type CreateAnnouncementRequest,
  type HandleReportRequest,
  type ModeratePostRequest,
  type ModerateReplyRequest,
  type MuteUserRequest,
  type PostStatus,
  type ReplyStatus,
  type ReportStatus,
  type UnbanUserRequest,
  type UnmuteUserRequest,
} from '@mcserauth/shared';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AdminUserListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class AdminReportListQueryDto {
  @ApiPropertyOptional({ enum: REPORT_STATUSES })
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status?: ReportStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class BanUserDto implements BanUserRequest {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  banForum?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  banGame?: boolean;
}

export class UnbanUserDto implements UnbanUserRequest {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  unbanForum?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  unbanGame?: boolean;
}

export class MuteUserDto implements MuteUserRequest {
  @ApiProperty({ minimum: 1, maximum: 720, description: '禁言时长（小时）' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  durationHours!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UnmuteUserDto implements UnmuteUserRequest {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ModeratePostDto implements ModeratePostRequest {
  @ApiPropertyOptional({ enum: POST_STATUSES })
  @IsOptional()
  @IsIn(POST_STATUSES)
  status?: PostStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  locked?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ModerateReplyDto implements ModerateReplyRequest {
  @ApiProperty({ enum: REPLY_STATUSES })
  @IsIn(REPLY_STATUSES)
  status!: ReplyStatus;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class HandleReportDto implements HandleReportRequest {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminCategoryDto implements AdminCategoryInput {
  @ApiProperty({ minLength: 2, maxLength: 40 })
  @IsString()
  @Length(2, 40)
  name!: string;

  @ApiProperty({ example: 'new-category' })
  @IsString()
  @Matches(/^[a-z0-9-]{2,40}$/, { message: 'slug 仅允许小写字母、数字与连字符' })
  slug!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parentId?: number | null;
}

export class UpdateAdminCategoryDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 40 })
  @IsOptional()
  @IsString()
  @Length(2, 40)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{2,40}$/, { message: 'slug 仅允许小写字母、数字与连字符' })
  slug?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parentId?: number | null;
}

export class CreateAnnouncementDto implements CreateAnnouncementRequest {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  message!: string;

  @ApiPropertyOptional({ description: '站内相对链接，如 /forum/post/1' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string | null;
}
