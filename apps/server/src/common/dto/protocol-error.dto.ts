import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ProtocolErrorBody } from '@mcserauth/shared';

/** Protocol-native error payload `{ error, errorMessage }` — never wrapped. */
export class ProtocolErrorDto implements ProtocolErrorBody {
  @ApiProperty({ example: 'NotImplementedException' })
  error!: string;

  @ApiProperty({ example: 'M0 stub' })
  errorMessage!: string;

  @ApiPropertyOptional()
  cause?: string;
}
