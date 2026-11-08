import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PROTOCOL_TOKEN_TYPE,
  USER_ROLES,
  type OAuthAuthenticateRequest,
  type OAuthAvailabilityResponse,
  type OAuthEntryConsentRequest,
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

export class OAuthEntryConsentDto implements OAuthEntryConsentRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  redirect_uri!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  client_id?: string;

  @ApiPropertyOptional({ enum: ['code'] })
  @IsOptional()
  @IsIn(['code'])
  response_type?: 'code';

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

  /** Consent-page checkbox; stores the remembered grant for registered clients. */
  @ApiPropertyOptional({ oneOf: [{ type: 'string' }, { type: 'boolean' }] })
  @IsOptional()
  remember?: 'on' | 'true' | '1' | boolean;
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
  client_secret?: string;

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

  /** Required when the token belongs to a confidential registered client. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  client_secret?: string;
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
