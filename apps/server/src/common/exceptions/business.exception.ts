import { HttpException } from '@nestjs/common';
import type { ErrorCode } from '@mcserauth/shared';
import { errorMessageFor } from '@mcserauth/shared';

/**
 * Business-level failure carrying a stable `ErrorCode`. The exception filter
 * turns it into `{ code, message }` and keeps the HTTP status for transport.
 */
export class BusinessException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: number,
    message: string = errorMessageFor(code),
  ) {
    super(message, status);
  }
}
