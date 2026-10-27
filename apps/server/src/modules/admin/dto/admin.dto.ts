import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SKIN_KINDS, SKIN_STATUSES, type SkinKind, type SkinStatus } from '@mcserauth/shared';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateServerDto {
  @ApiProperty({
    example: 'survival-1',
    description: '服务器白名单 ID（joinServer/hasJoined 使用）',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,64}$/, {
    message: 'serverId 仅允许字母、数字、点、下划线与连字符（1–64 位）',
  })
  serverId!: string;

  @ApiProperty({ example: '生存服一区' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: '服务器密钥；省略时自动生成，明文只在创建响应中返回一次（库中只存哈希）',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  secret?: string;
}

export class UpdateServerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ServerEntryDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  serverId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ example: '2026-10-20T12:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ description: '仅在创建响应中返回一次的明文密钥' })
  secret?: string;
}

export class ListTexturesQueryDto {
  @ApiPropertyOptional({ enum: SKIN_STATUSES })
  @IsOptional()
  @IsIn(SKIN_STATUSES)
  status?: SkinStatus;

  @ApiPropertyOptional({ enum: SKIN_KINDS })
  @IsOptional()
  @IsIn(SKIN_KINDS)
  kind?: SkinKind;
}

export class ReviewTextureDto {
  @ApiPropertyOptional({ description: '处理备注（写入 moderation_log）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminTextureDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  playerUuid!: string;

  @ApiProperty()
  nickname!: string;

  @ApiProperty({ enum: SKIN_KINDS })
  kind!: SkinKind;

  @ApiProperty({ enum: ['classic', 'slim'], nullable: true })
  variant!: 'classic' | 'slim' | null;

  @ApiProperty({ enum: SKIN_STATUSES })
  status!: SkinStatus;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ example: '2026-10-20T12:00:00.000Z' })
  uploadedAt!: string;

  @ApiProperty({ description: '带签名的短期预览 URL' })
  url!: string;
}
