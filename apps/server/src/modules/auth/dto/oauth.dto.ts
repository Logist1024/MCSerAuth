import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PROTOCOL_TOKEN_TYPE,
  USER_ROLES,
  type OAuthAuthenticateRequest,
  type OAuthAvailabilityResponse,
  type OAuthEntryQuery,
  type OAuthRefreshRequest,
  type OAuthTokenResponse,
  type OAuthUserSummary,
  type UserProfilesMeResponse,
} from '@mcserauth/shared';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Request/response DTOs for the Commons-Designs OAuth-style endpoints.
 * Types come from @mcserauth/shared; these classes only add transport
 * validation and Swagger metadata (no duplicated type definitions).
 */

export class OAuthEntryQueryDto implements OAuthEntryQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  client_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  response_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code_challenge?: string;

  @ApiPropertyOptional({ enum: ['S256', 'plain'] })
  @IsOptional()
  @IsIn(['S256', 'plain'])
  code_challenge_method?: 'S256' | 'plain';
}

export class OAuthAuthenticateRequestDto implements OAuthAuthenticateRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  client_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code_verifier?: string;
}

export class OAuthRefreshRequestDto implements OAuthRefreshRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  client_id?: string;
}

export class OAuthAvailabilityResponseDto implements OAuthAvailabilityResponse {
  @ApiProperty({ example: true, description: 'M0: 服务可达即为 true' })
  available!: boolean;
}

export class OAuthUserSummaryDto implements OAuthUserSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: USER_ROLES })
  role!: OAuthUserSummary['role'];
}

export class OAuthTokenResponseDto implements OAuthTokenResponse {
  @ApiProperty()
  access_token!: string;

  @ApiProperty({ enum: [PROTOCOL_TOKEN_TYPE], example: PROTOCOL_TOKEN_TYPE })
  token_type!: typeof PROTOCOL_TOKEN_TYPE;

  @ApiProperty({ example: 2_592_000 })
  expires_in!: number;

  @ApiProperty()
  refresh_token!: string;

  @ApiPropertyOptional()
  scope?: string;

  @ApiPropertyOptional({ type: OAuthUserSummaryDto })
  user?: OAuthUserSummaryDto;
}

export class UserPlayerSummaryDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty()
  nickname!: string;

  @ApiProperty()
  banned!: boolean;
}

export class UserProfilesMeResponseDto implements UserProfilesMeResponse {
  @ApiProperty({ type: OAuthUserSummaryDto })
  user!: OAuthUserSummaryDto;

  @ApiProperty({ type: UserPlayerSummaryDto, nullable: true })
  player!: UserPlayerSummaryDto | null;
}
