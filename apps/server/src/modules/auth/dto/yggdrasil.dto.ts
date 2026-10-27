import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  YggdrasilAgent,
  YggdrasilAuthenticateRequest,
  YggdrasilAuthenticateResponse,
  YggdrasilMetadata,
  YggdrasilProfile,
  YggdrasilRefreshRequest,
  YggdrasilRefreshResponse,
  YggdrasilUser,
  YggdrasilValidateRequest,
} from '@mcserauth/shared';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Launcher agent descriptor; accepted for compatibility, not enforced. */
export class YggdrasilAgentDto implements YggdrasilAgent {
  @ApiProperty({ example: 'Minecraft' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  version!: number;
}

export class YggdrasilAuthenticateRequestDto implements YggdrasilAuthenticateRequest {
  @ApiPropertyOptional({ type: YggdrasilAgentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => YggdrasilAgentDto)
  agent?: YggdrasilAgentDto;

  @ApiProperty({ description: '网站账号邮箱', example: 'admin@mcserauth.dev' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  username!: string;

  @ApiProperty({ example: 'Admin@12345' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  password!: string;

  @ApiPropertyOptional({ description: '启动器自身标识；不传则由服务端生成' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientToken?: string;

  @ApiPropertyOptional({ description: '为 true 时额外返回 user 对象' })
  @IsOptional()
  @IsBoolean()
  requestUser?: boolean;
}

export class YggdrasilRefreshRequestDto implements YggdrasilRefreshRequest {
  @ApiProperty({ description: '当前访问令牌' })
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requestUser?: boolean;
}

export class YggdrasilValidateRequestDto implements YggdrasilValidateRequest {
  @ApiProperty({ description: '待校验的访问令牌' })
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientToken?: string;
}

export class YggdrasilProfileDto implements YggdrasilProfile {
  @ApiProperty({ example: '85cbb85205d944eea137574bd7afe854' })
  id!: string;

  @ApiProperty({ example: 'Admin' })
  name!: string;
}

export class YggdrasilUserDto implements YggdrasilUser {
  @ApiProperty()
  id!: string;
}

export class YggdrasilAuthenticateResponseDto implements YggdrasilAuthenticateResponse {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  clientToken!: string;

  @ApiProperty({ type: [YggdrasilProfileDto] })
  availableProfiles!: YggdrasilProfileDto[];

  @ApiPropertyOptional({ type: YggdrasilProfileDto })
  selectedProfile?: YggdrasilProfileDto;

  @ApiPropertyOptional({ type: YggdrasilUserDto })
  user?: YggdrasilUserDto;
}

export class YggdrasilRefreshResponseDto implements YggdrasilRefreshResponse {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  clientToken!: string;

  @ApiPropertyOptional({ type: YggdrasilProfileDto })
  selectedProfile?: YggdrasilProfileDto;

  @ApiPropertyOptional({ type: YggdrasilUserDto })
  user?: YggdrasilUserDto;
}

export class YggdrasilMetadataMetaDto {
  @ApiProperty({ example: 'MCSerAuth' })
  serverName!: string;

  @ApiProperty({ example: 'MCSerAuth' })
  implementationName!: string;

  @ApiProperty({ example: '0.1.0' })
  implementationVersion!: string;

  @ApiPropertyOptional({ example: { homepage: 'http://localhost:3000' } })
  links?: { homepage?: string };
}

export class YggdrasilMetadataDto implements YggdrasilMetadata {
  @ApiProperty({ type: YggdrasilMetadataMetaDto })
  meta!: YggdrasilMetadataMetaDto;

  @ApiProperty({ type: [String], example: ['localhost', '127.0.0.1'] })
  skinDomains!: string[];
}
