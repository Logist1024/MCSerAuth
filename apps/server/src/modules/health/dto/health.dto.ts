import { ApiProperty } from '@nestjs/swagger';
import type { HealthCheckState, HealthData, HealthState } from '@mcserauth/shared';

export class HealthDataDto implements HealthData {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status!: HealthState;

  @ApiProperty({ example: '0.1.0' })
  version!: string;

  @ApiProperty({ example: 12 })
  uptimeSeconds!: number;

  @ApiProperty({
    type: 'object',
    required: ['database'],
    properties: { database: { type: 'string', enum: ['up', 'down'] } },
  })
  checks!: { database: HealthCheckState };
}
