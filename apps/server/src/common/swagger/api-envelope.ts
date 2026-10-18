import type { Type } from '@nestjs/common';
import { getSchemaPath, type SchemaObject } from '@nestjs/swagger';

/**
 * Documents the unified success envelope `{ code: 0, data: Dto }` around a
 * concrete DTO. Used by non-protocol endpoints only.
 */
export function apiSuccessSchema(dto: Type<unknown>): SchemaObject {
  return {
    type: 'object',
    required: ['code', 'data'],
    properties: {
      code: { type: 'integer', example: 0 },
      data: { $ref: getSchemaPath(dto) },
    },
  };
}
