import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  POST_SORT_OPTIONS,
  REPORT_TARGET_TYPES,
  type CreatePostRequest,
  type CreateReplyRequest,
  type CreateReportRequest,
  type PostSortOption,
  type ReportTargetType,
  type UpdatePostRequest,
} from '@mcserauth/shared';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class ForumPostDetailQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  replyPage?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  replyPageSize?: number;
}

export class ForumPostListQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiPropertyOptional({ enum: POST_SORT_OPTIONS, default: 'activity' })
  @IsOptional()
  @IsIn(POST_SORT_OPTIONS as unknown as string[])
  sort?: PostSortOption;

  @ApiPropertyOptional({ minLength: 1, maxLength: 50 })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  search?: string;
}

export class CreatePostDto implements CreatePostRequest {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId!: number;

  @ApiProperty({ minLength: 3, maxLength: 100 })
  @IsString()
  @Length(3, 100)
  title!: string;

  @ApiProperty({ minLength: 1, maxLength: 20000 })
  @IsString()
  @Length(1, 20000)
  contentMd!: string;
}

export class UpdatePostDto implements UpdatePostRequest {
  @ApiPropertyOptional({ minLength: 3, maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(3, 100)
  title?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 20000 })
  @IsOptional()
  @IsString()
  @Length(1, 20000)
  contentMd?: string;
}

export class CreateReplyDto implements CreateReplyRequest {
  @ApiProperty({ minLength: 1, maxLength: 10000 })
  @IsString()
  @Length(1, 10000)
  contentMd!: string;
}

export class NotificationListQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

export class CreateReportDto implements CreateReportRequest {
  @ApiProperty({ enum: REPORT_TARGET_TYPES })
  @IsIn(REPORT_TARGET_TYPES)
  targetType!: ReportTargetType;

  @ApiProperty({ description: '帖子/回复/纹理为数字 ID，用户为账号 ID' })
  @IsString()
  @Length(1, 64)
  targetId!: string;

  @ApiProperty({ minLength: 5, maxLength: 500 })
  @IsString()
  @Length(5, 500)
  reason!: string;
}
