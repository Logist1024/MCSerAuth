import { describe, expect, it } from 'vitest';
import { AuthClientError, describeAuthError } from './auth-client';

describe('describeAuthError', () => {
  it('maps known better-auth codes to Chinese text', () => {
    expect(
      describeAuthError(
        new AuthClientError('Invalid email or password', 401, 'INVALID_EMAIL_OR_PASSWORD'),
      ),
    ).toBe('邮箱或密码不正确');
    expect(
      describeAuthError(new AuthClientError('User already exists', 400, 'USER_ALREADY_EXISTS')),
    ).toBe('该邮箱已被注册，试试直接登录');
    expect(
      describeAuthError(new AuthClientError('Failed to create user', 500, 'FAILED_TO_CREATE_USER')),
    ).toBe('注册暂时失败，请稍后再试');
  });

  it('falls back to English message matching when the code is unknown', () => {
    expect(describeAuthError(new AuthClientError('Invalid email or password', 401, ''))).toBe(
      '邮箱或密码不正确',
    );
    expect(describeAuthError(new AuthClientError('User already exists', 400, ''))).toBe(
      '该邮箱已被注册，试试直接登录',
    );
    expect(describeAuthError(new AuthClientError('Invalid email', 400, ''))).toBe('邮箱格式不正确');
  });

  it('passes server-side Chinese messages through unchanged', () => {
    expect(describeAuthError(new AuthClientError('该昵称已被其他账号使用', 400, ''))).toBe(
      '该昵称已被其他账号使用',
    );
  });

  it('keeps the existing code mappings intact', () => {
    expect(describeAuthError(new AuthClientError('x', 400, 'EMAIL_NOT_VERIFIED'))).toBe(
      '邮箱尚未验证，请先到邮箱打开验证链接',
    );
  });

  it('stringifies non-error values', () => {
    expect(describeAuthError('boom')).toBe('boom');
  });
});
