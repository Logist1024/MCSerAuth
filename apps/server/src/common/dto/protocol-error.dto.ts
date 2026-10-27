import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ProtocolErrorBody } from '@mcserauth/shared';

/** Protocol-native error payload `{ error, errorMessage }` — never wrapped. */
export class ProtocolErrorDto implements ProtocolErrorBody {
  @ApiProperty({ example: 'IllegalArgumentException' })
  error!: string;

  @ApiProperty({ example: '请求参数不合法' })
  errorMessage!: string;

  @ApiPropertyOptional()
  cause?: string;
}
