import { SetMetadata } from '@nestjs/common';

export const PROTOCOL_API_KEY = 'mcserauth:protocol-api';

/**
 * Request marker consumed by the exception filter.
 *
 * Nest 12 builds the filter's ArgumentsHost without handler metadata, so the
 * interceptor (which does receive an ExecutionContext) stamps the decision onto
 * the request object; the filter reads it back. Guards added on protocol routes
 * in M1 must set the same marker before throwing.
 */
export const PROTOCOL_REQUEST_MARKER = 'protocolApi';

/**
 * Marks a controller/handler as a Commons-Designs protocol endpoint.
 *
 * Protocol endpoints bypass the unified `{ code, data }` envelope in both
 * directions: successful payloads are returned verbatim and errors use
 * `{ error, errorMessage }` (see shared protocol helpers).
 */
export const ProtocolApi = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PROTOCOL_API_KEY, true);
