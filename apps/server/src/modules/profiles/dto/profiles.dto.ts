import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CapeTexture,
  MinecraftProfileResponse,
  ProfilesBatchRequest,
  SkinTexture,
  SkinUploadMetadata,
  TextureState,
} from '@mcserauth/shared';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, MinLength } from 'class-validator';

export class ProfilesBatchRequestDto implements ProfilesBatchRequest {
  @ApiProperty({ type: [String], example: ['Notch', 'jeb_'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  names!: string[];
}

export class SkinTextureDto implements SkinTexture {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  state!: TextureState;

  @ApiProperty()
  url!: string;

  @ApiProperty({ enum: ['CLASSIC', 'SLIM'] })
  variant!: SkinTexture['variant'];

  @ApiPropertyOptional()
  alias?: string;
}

export class CapeTextureDto implements CapeTexture {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  state!: TextureState;

  @ApiProperty()
  url!: string;

  @ApiPropertyOptional()
  alias?: string;
}

export class MinecraftProfileResponseDto implements MinecraftProfileResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [SkinTextureDto] })
  skins!: SkinTextureDto[];

  @ApiProperty({ type: [CapeTextureDto] })
  capes!: CapeTextureDto[];
}

/** Multipart metadata accepted by POST /minecraft/profile/skins. */
export class SkinUploadMetadataDto implements SkinUploadMetadata {
  @ApiProperty({ enum: ['classic', 'slim'] })
  @IsIn(['classic', 'slim'])
  variant!: SkinUploadMetadata['variant'];
}
