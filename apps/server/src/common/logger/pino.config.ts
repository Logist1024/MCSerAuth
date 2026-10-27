import type { Params } from 'nestjs-pino';
import type { AppConfigService } from '../../config/app-config.service.js';
import { maskIp } from '../utils/redact.js';

/** Sensitive keys stripped before anything reaches the log sink. */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.key',
  'req.body.smtpPass',
  'req.body.token',
  'req.body.accessToken',
  'req.body.refreshToken',
  'req.body.access_token',
  'req.body.refresh_token',
  'req.body.code',
];

/**
 * Shape pino-std-serializers hands to a custom serializer: the already
 * serialized request object, not the raw Node request.
 */
interface SerializedRequestInput {
  id?: string | number | object;
  method?: string;
  url?: string;
  remoteAddress?: string;
  remotePort?: number;
  headers?: Record<string, unknown>;
}

/**
 * pino configuration (via nestjs-pino): pretty output in dev, JSON in
 * production, tokens/cookies redacted and client IPs masked.
 */
export function buildPinoParams(config: AppConfigService): Params {
  const pretty = config.nodeEnv === 'development' && config.logLevel !== 'silent';

  return {
    pinoHttp: {
      level: config.logLevel,
      transport: pretty
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
      serializers: {
        req: (req: SerializedRequestInput) => ({
          id: req.id,
          method: req.method,
          url: req.url?.split('?')[0],
          remoteAddress: maskIp(req.remoteAddress ?? ''),
          remotePort: req.remotePort,
          userAgent:
            typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: {
        ignore: (req) => {
          const url = req.url ?? '';
          return url === '/health' || url === '/docs' || url.startsWith('/docs/');
        },
      },
    },
  };
}
