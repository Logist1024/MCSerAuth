import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SHOP_ITEM_KEYS, type ShopItemKey } from '@mcserauth/shared';
import { Type } from 'class-transformer';
import {
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

const SHOP_KEYS = SHOP_ITEM_KEYS;

export class PurchaseDto {
  @ApiProperty({ enum: SHOP_KEYS })
  @IsIn(SHOP_KEYS)
  item!: ShopItemKey;

  @ApiPropertyOptional({ description: 'Banner 标题（购买 banner 时必填）', maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  bannerTitle?: string;

  @ApiPropertyOptional({ description: 'Banner 描述', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bannerDescription?: string;

  @ApiPropertyOptional({ description: 'Banner 跳转链接（http/https）', maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bannerHref?: string;
}

export class TipDto {
  @ApiProperty({ description: '被打赏的用户 ID' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ minimum: 1, maximum: 10_000 })
  @IsInt()
  @Min(1)
  @Max(10_000)
  amount!: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}

export class SubmitTitleApplicationDto {
  @ApiProperty({ minLength: 2, maxLength: 20 })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  proposedName!: string;

  @ApiProperty({ minLength: 5, maxLength: 300 })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

export class TransactionQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

export class LeaderboardQueryDto {
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
