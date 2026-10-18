import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthData } from '@mcserauth/shared';
import { APP_VERSION } from '../../app.constants.js';
import { apiSuccessSchema } from '../../common/swagger/api-envelope.js';
import { DbService } from '../../db/db.service.js';
import { HealthDataDto } from './dto/health.dto.js';

/** `GET /health` (excluded from the /api prefix). Always 200 while the process lives. */
@ApiTags('ops')
@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Get()
  @ApiOperation({ summary: '健康检查', description: '返回进程与 SQLite 探活结果（统一封装）。' })
  @ApiOkResponse({ schema: apiSuccessSchema(HealthDataDto) })
  check(): HealthData {
    const databaseUp = this.db.ping();
    return {
      status: databaseUp ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      checks: { database: databaseUp ? 'up' : 'down' },
    };
  }
}
