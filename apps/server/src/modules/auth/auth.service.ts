import { Injectable } from '@nestjs/common';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import { AppConfigService } from '../../config/app-config.service.js';
import { DbService } from '../../db/db.service.js';
import { type Auth, createAuth } from './auth.instance.js';

/**
 * Owns the single better-auth instance and the Node handler mounted at
 * `/api/auth/*` by main.ts.
 */
@Injectable()
export class AuthService {
  readonly auth: Auth;
  readonly handler: ReturnType<typeof toNodeHandler>;

  constructor(config: AppConfigService, db: DbService) {
    this.auth = createAuth(config.env, db);
    this.handler = toNodeHandler(this.auth);
  }

  /** Resolves the cookie session for a raw Node request (future guards/M1). */
  async getSession(
    headers: IncomingHttpHeaders,
  ): Promise<Awaited<ReturnType<Auth['api']['getSession']>>> {
    return this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
  }
}
