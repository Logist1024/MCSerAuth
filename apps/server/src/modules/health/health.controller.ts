import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthData } from '@mcserauth/shared';
import { APP_VERSION } from '../../app.constants.js';
import { apiSuccessSchema } from '../../common/swagger/api-envelope.js';
import { DbService } from '../../db/db.service.js';
import { HealthDataDto } from './dto/health.dto.js';

/**
 * `GET /health` (excluded from the /api prefix).
 *
 * F5 splits the probes so process managers and the reverse proxy can act on
 * the right signal: `live` reports the process itself, `ready` fails (503)
 * while the database is unreachable. The combined `GET /health` is kept for
 * backward compatibility with existing scripts.
 */
@ApiTags('ops')
@ApiExtraModels(HealthDataDto)
@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}

  /** Liveness probe for pm2: 200 whenever the process can serve requests. */
  @Get('live')
  @ApiOperation({
    summary: '存活探针（liveness）',
    description: '进程存活即返回 200，不探测数据库。',
  })
  @ApiOkResponse({ schema: apiSuccessSchema(HealthDataDto) })
  live(): HealthData {
    return {
      status: 'ok',
      version: APP_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      checks: {},
    };
  }

  /** Readiness probe: 503 while `DbService.ping()` fails, so traffic stops early. */
  @Get('ready')
  @ApiOperation({
    summary: '就绪探针（readiness）',
    description: '数据库 ping 失败时返回 503；Caddy/pm2 以此决定摘流。',
  })
  @ApiOkResponse({ schema: apiSuccessSchema(HealthDataDto) })
  async ready(): Promise<HealthData> {
    const databaseUp = await this.db.ping();
    if (!databaseUp) {
      throw new ServiceUnavailableException('数据库不可用（readiness 失败）');
    }
    return {
      status: 'ok',
      version: APP_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      checks: { database: 'up' },
    };
  }

  @Get()
  @ApiOperation({ summary: '健康检查', description: '返回进程与数据库探活结果（统一封装）。' })
  @ApiOkResponse({ schema: apiSuccessSchema(HealthDataDto) })
  async check(): Promise<HealthData> {
    const databaseUp = await this.db.ping();
    return {
      status: databaseUp ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      checks: { database: databaseUp ? 'up' : 'down' },
    };
  }
}
