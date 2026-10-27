/**
 * Application error codes (unified response envelope).
 *
 * Successful responses are `{ code: 0, data }`.
 * Failures are `{ code: <ErrorCode>, message }`.
 *
 * Commons-Designs protocol endpoints are the documented exception: they must
 * return protocol-native payloads (`{ error, errorMessage }`) and never use
 * this envelope.
 */
export const ErrorCode = {
  OK: 0,
  INTERNAL: 10000,
  VALIDATION_FAILED: 10001,
  UNAUTHORIZED: 10002,
  FORBIDDEN: 10003,
  NOT_FOUND: 10004,
  CONFLICT: 10005,
  NOT_IMPLEMENTED: 10006,
  RATE_LIMITED: 10007,
  SERVICE_UNAVAILABLE: 10008,
  NICKNAME_TAKEN: 20001,
  RENAME_COOLDOWN: 20002,
  UPLOAD_QUOTA_EXCEEDED: 20003,
  ORIGIN_BLOCKED: 20004,
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.OK]: 'ok',
  [ErrorCode.INTERNAL]: '服务器内部错误',
  [ErrorCode.VALIDATION_FAILED]: '请求参数校验失败',
  [ErrorCode.UNAUTHORIZED]: '未登录或登录已失效',
  [ErrorCode.FORBIDDEN]: '没有权限执行此操作',
  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.CONFLICT]: '资源冲突',
  [ErrorCode.NOT_IMPLEMENTED]: '该功能尚未实现（M0 占位）',
  [ErrorCode.RATE_LIMITED]: '请求过于频繁，请稍后再试',
  [ErrorCode.SERVICE_UNAVAILABLE]: '服务暂时不可用',
  [ErrorCode.NICKNAME_TAKEN]: '该昵称已被使用',
  [ErrorCode.RENAME_COOLDOWN]: '改名冷却中',
  [ErrorCode.UPLOAD_QUOTA_EXCEEDED]: '上传次数已达上限，请稍后再试',
  [ErrorCode.ORIGIN_BLOCKED]: '请求来源不受信任',
};

export function errorMessageFor(code: ErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Maps an HTTP status produced by the exception filter onto a business code. */
export function errorCodeForHttpStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
    case 413:
    case 415:
    case 422:
      return ErrorCode.VALIDATION_FAILED;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 429:
      return ErrorCode.RATE_LIMITED;
    case 501:
      return ErrorCode.NOT_IMPLEMENTED;
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return ErrorCode.INTERNAL;
  }
}
