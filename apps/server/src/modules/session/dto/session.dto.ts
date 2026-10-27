import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { HasJoinedQuery, JoinServerRequest } from '@mcserauth/shared';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class JoinServerRequestDto implements JoinServerRequest {
  @ApiProperty({ description: '启动器访问令牌' })
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @ApiProperty({ description: '玩家 UUID（32 位无连字符；兼容带连字符形式）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  selectedProfile!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  serverId!: string;
}

export class HasJoinedQueryDto implements HasJoinedQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  username!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  serverId!: string;

  @ApiPropertyOptional({ description: '服务器观测到的客户端 IP（可选，用于绑定会话）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip?: string;
}
