import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ADMIN_PERMISSIONS,
  BANNER_STATUSES,
  type AdminPermission,
  type BannerStatus,
  type GrowthRulesPatch,
} from '@mcserauth/shared';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTitleDto {
  @ApiProperty({ minLength: 2, maxLength: 20 })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  name!: string;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @ApiPropertyOptional({ description: '#RRGGBB', maxLength: 7 })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;
}

export class TitleUserDto {
  @ApiProperty({ description: '目标用户 ID' })
  @IsString()
  @IsNotEmpty()
  userId!: string;
}

export class AdjustPointsDto {
  @ApiProperty({ description: '正数发放、负数扣减', minimum: -100_000, maximum: 100_000 })
  @IsInt()
  @Min(-100_000)
  @Max(100_000)
  amount!: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}

export class BannerListQueryDto {
  @ApiPropertyOptional({ enum: BANNER_STATUSES })
  @IsOptional()
  @IsIn(BANNER_STATUSES)
  status?: BannerStatus;
}

export class UpdatePermissionsDto {
  @ApiProperty({ enum: ADMIN_PERMISSIONS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(ADMIN_PERMISSIONS.length)
  @IsIn(ADMIN_PERMISSIONS, { each: true })
  permissions!: AdminPermission[];
}

/**
 * Partial override of the growth economy. Omitted keys keep the shipped
 * default; the service merges and re-validates against `growthRulesSchema`.
 */
export class GrowthRulesDto implements GrowthRulesPatch {
  @ApiPropertyOptional({ description: '每日签到基础经验', minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  checkinBaseXp?: number;

  @ApiPropertyOptional({ description: '连签每日额外经验', minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  checkinStreakXp?: number;

  @ApiPropertyOptional({ description: '连签经验加成封顶天数', minimum: 0, maximum: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  checkinStreakXpCap?: number;

  @ApiPropertyOptional({ description: '每日签到基础积分', minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  checkinBasePoints?: number;

  @ApiPropertyOptional({ description: '连签每日额外积分', minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  checkinStreakPoints?: number;

  @ApiPropertyOptional({ description: '连签积分加成封顶天数', minimum: 0, maximum: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  checkinStreakPointsCap?: number;

  @ApiPropertyOptional({ description: '发帖经验', minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  postXp?: number;

  @ApiPropertyOptional({ description: '发帖每日经验上限条数', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  postDailyXpLimit?: number;

  @ApiPropertyOptional({ description: '回帖经验', minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  replyXp?: number;

  @ApiPropertyOptional({ description: '回帖每日经验上限条数', minimum: 0, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  replyDailyXpLimit?: number;

  @ApiPropertyOptional({ description: '翻倍卡倍率', minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  xpBoostMultiplier?: number;

  @ApiPropertyOptional({ description: '翻倍卡时长（小时）', minimum: 1, maximum: 720 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  xpBoostHours?: number;

  @ApiPropertyOptional({ description: '翻倍卡价格（积分）', minimum: 0, maximum: 1000000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  xpBoostPrice?: number;

  @ApiPropertyOptional({ description: '披风解锁价格（积分）', minimum: 0, maximum: 1000000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  capeUnlockPrice?: number;

  @ApiPropertyOptional({ description: 'Banner 价格（积分）', minimum: 0, maximum: 1000000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  bannerPrice?: number;

  @ApiPropertyOptional({ description: 'Banner 展示天数', minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  bannerDays?: number;

  @ApiPropertyOptional({ description: '首页同时展示的 Banner 上限', minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  bannerMaxActive?: number;

  @ApiPropertyOptional({ description: '单次打赏下限（积分）', minimum: 1, maximum: 1000000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  tipMin?: number;

  @ApiPropertyOptional({ description: '单次打赏上限（积分）', minimum: 1, maximum: 10000000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  tipMax?: number;

  @ApiPropertyOptional({ description: '可申请专属称号的等级', minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  titleApplicationLevel?: number;
}
