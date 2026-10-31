import { createRequire } from 'node:module';
import { RequestMethod } from '@nestjs/common';

const require = createRequire(import.meta.url);

/** Derived from package.json so the API contract version never drifts from the release. */
export const APP_VERSION: string = (require('../package.json') as { version: string }).version;

/**
 * Routes served without the `/api` global prefix, so probes keep a stable shape
 * for pm2/Caddy. Shared because `main.ts` (routing) and `scripts/export-openapi.ts`
 * (contract) must exclude the same set — otherwise OpenAPI advertises `/api/health/*`.
 */
export const PREFIX_EXCLUDED_ROUTES: { path: string; method: RequestMethod }[] = [
  { path: 'health', method: RequestMethod.GET },
  { path: 'health/live', method: RequestMethod.GET },
  { path: 'health/ready', method: RequestMethod.GET },
];
