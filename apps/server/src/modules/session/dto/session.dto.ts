import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { HasJoinedQuery, JoinServerRequest } from '@mcserauth/shared';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class JoinServerRequestDto implements JoinServerRequest {
  @ApiProperty({ description: '启动器访问令牌' })
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @ApiProperty({ description: '玩家 UUID（小写、无连字符）' })
  @IsString()
  @IsNotEmpty()
  selectedProfile!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  serverId!: string;
}

export class HasJoinedQueryDto implements HasJoinedQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  serverId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ip?: string;
}
