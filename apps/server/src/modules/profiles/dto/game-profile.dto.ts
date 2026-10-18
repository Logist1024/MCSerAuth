import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { GameProfile, GameProfileProperty } from '@mcserauth/shared';

export class GameProfilePropertyDto implements GameProfileProperty {
  @ApiProperty({ example: 'textures' })
  name!: string;

  @ApiProperty()
  value!: string;

  @ApiPropertyOptional()
  signature?: string;
}

/** Yggdrasil GameProfile (`id` is a dashless UUID). */
export class GameProfileDto implements GameProfile {
  @ApiProperty({ example: '069a79f444e94726a5befca90e38aaf5' })
  id!: string;

  @ApiProperty({ example: 'Notch' })
  name!: string;

  @ApiPropertyOptional({ type: [GameProfilePropertyDto] })
  properties?: GameProfilePropertyDto[];

  @ApiPropertyOptional({ type: [String] })
  profileActions?: string[];
}
