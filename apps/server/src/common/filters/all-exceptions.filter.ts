import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ErrorCode,
  errorCodeForHttpStatus,
  errorMessageFor,
  protocolErrorNameForHttpStatus,
  type ProtocolErrorBody,
} from '@mcserauth/shared';
import { PinoLogger } from 'nestjs-pino';
import type { Request, Response } from 'express';
import { BusinessException } from '../exceptions/business.exception.js';
import { PROTOCOL_REQUEST_MARKER } from '../decorators/protocol-api.decorator.js';

interface ObjectWithMessage {
  message?: unknown;
  error?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractMessage(exception: unknown): string {
  if (exception instanceof HttpException) {
    const body = exception.getResponse() as unknown;
    if (typeof body === 'string') {
      return body;
    }
    if (isRecord(body)) {
      const typed = body as ObjectWithMessage;
      if (Array.isArray(typed.message)) {
        return typed.message.join('; ');
      }
      if (typeof typed.message === 'string') {
        return typed.message;
      }
      if (typeof typed.error === 'string') {
        return typed.error;
      }
    }
    return exception.message;
  }
  if (exception instanceof Error) {
    return exception.message;
  }
  return 'Unknown error';
}

/**
 * Single exit point for every failure.
 *
 * - protocol endpoints → `{ error, errorMessage }` (native Commons-Designs shape)
 * - everything else   → `{ code, message }` (unified envelope)
 *
 * The protocol flag is read from the request (stamped by ResponseInterceptor).
 * 5xx details are logged but never leaked to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<
      Request & { id?: string | number } & { [PROTOCOL_REQUEST_MARKER]?: boolean }
    >();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawMessage = extractMessage(exception);
    const isProtocol = request[PROTOCOL_REQUEST_MARKER] === true;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception, reqId: request.id, path: request.originalUrl, method: request.method },
        'Unhandled server error',
      );
    } else {
      this.logger.warn(
        {
          reqId: request.id,
          path: request.originalUrl,
          method: request.method,
          status,
          message: rawMessage,
        },
        'Request failed',
      );
    }

    if (response.headersSent) {
      return;
    }

    if (isProtocol) {
      const body: ProtocolErrorBody = {
        error: protocolErrorNameForHttpStatus(status),
        errorMessage: rawMessage,
      };
      response.status(status).json(body);
      return;
    }

    const code =
      exception instanceof BusinessException ? exception.code : errorCodeForHttpStatus(status);
    const isUnexpected =
      status >= HttpStatus.INTERNAL_SERVER_ERROR && !(exception instanceof BusinessException);

    response.status(status).json({
      code,
      message: isUnexpected ? errorMessageFor(ErrorCode.INTERNAL) : rawMessage,
    });
  }
}
