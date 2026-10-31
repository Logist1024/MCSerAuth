import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Derived from package.json so the API contract version never drifts from the release. */
export const APP_VERSION: string = (require('../package.json') as { version: string }).version;
