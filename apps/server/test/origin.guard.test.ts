import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { OriginGuard } from '../src/common/guards/origin.guard.js';
import { BusinessException } from '../src/common/exceptions/business.exception.js';
import { createTestContext, type TestContext } from './helpers/db.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function contextFor(method: string, headers: Record<string, string>): ExecutionContext {
  const request = { method, headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler(): void {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('OriginGuard', () => {
  let ctx: TestContext;
  let guard: OriginGuard;

  beforeEach(async () => {
    ctx = await createTestContext();
    guard = new OriginGuard(new Reflector(), ctx.config);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('rejects untrusted origins on unsafe methods', () => {
    expect(() => guard.canActivate(contextFor('POST', { origin: 'https://evil.example' }))).toThrow(
      BusinessException,
    );
  });

  it('accepts configured origins and safe methods', () => {
    expect(guard.canActivate(contextFor('POST', { origin: 'http://localhost:3000' }))).toBe(true);
    expect(guard.canActivate(contextFor('GET', { origin: 'https://evil.example' }))).toBe(true);
  });

  it('allows non-browser clients without an origin outside production', () => {
    expect(guard.canActivate(contextFor('POST', {}))).toBe(true);
  });
});
