import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
import { PROTOCOL_API_KEY, PROTOCOL_REQUEST_MARKER } from '../decorators/protocol-api.decorator.js';

type MarkedRequest = Request & { [PROTOCOL_REQUEST_MARKER]?: boolean };

/**
 * Wraps successful non-protocol responses into `{ code: 0, data }`.
 * Protocol endpoints are passed through untouched (protocol fidelity first).
 *
 * Also stamps the protocol flag onto the request so the exception filter can
 * answer in the right shape (see PROTOCOL_REQUEST_MARKER).
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isProtocol = this.reflector.getAllAndOverride<boolean>(PROTOCOL_API_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<MarkedRequest>();
    request[PROTOCOL_REQUEST_MARKER] = isProtocol;

    if (isProtocol) {
      return next.handle();
    }

    return next.handle().pipe(map((data: unknown) => ({ code: 0 as const, data })));
  }
}
