import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { YggdrasilHasJoinedQuery, YggdrasilJoinRequest } from '@mcserauth/shared';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class YggdrasilJoinRequestDto implements YggdrasilJoinRequest {
  @ApiProperty({ description: '启动器访问令牌' })
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @ApiProperty({ description: '玩家 UUID（32 位无连字符；兼容带连字符形式）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  selectedProfile!: string;

  @ApiProperty({
    description: '服务端握手哈希（每个服务器每次握手都不同，不要求是白名单 ID）',
    example: 'a1b2c3d4e5f6',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  serverId!: string;
}

export class YggdrasilHasJoinedQueryDto implements YggdrasilHasJoinedQuery {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  username!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  serverId!: string;

  @ApiPropertyOptional({ description: '服务器观测到的客户端 IP（可选，用于绑定会话）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip?: string;
}
