'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { describeAuthError, resetPassword as resetPasswordRequest } from '@/lib/auth-client';

/**
 * Step 2 of «forgot password»: better-auth's `/reset-password/:token`
 * redirect lands here with `?token=…` (unknown/expired becomes
 * `?error=INVALID_TOKEN`); the form posts the new password with the token.
 */
export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const tokenError = searchParams.get('error');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (password.length < 8) {
      setError('密码至少 8 位');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (token !== null) {
        await resetPasswordRequest(token, password);
      }
      setDone(true);
    } catch (authError) {
      setError(describeAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-card">
        <h2>密码已重置</h2>
        <p>用新密码登录，去启动器或网页都可以继续使用了。</p>
        <div className="auth-form">
          <button
            className="button primary"
            type="button"
            disabled={busy}
            onClick={() => {
              router.push('/login');
            }}
          >
            去登录
          </button>
          <Link className="button ghost" href="/forum">
            先去论坛看看
          </Link>
        </div>
      </div>
    );
  }

  if (token === null || tokenError !== null) {
    return (
      <div className="auth-card">
        <h2>链接已失效</h2>
        <p>重置链接无效或已超过 1 小时有效期。</p>
        <p className="small muted">
          如果是刚收到的邮件，请确认从邮件里点击的是最新一封；链接被复制转发给他人后可能被提前使用。
        </p>
        <div className="auth-form">
          <Link className="button primary" href="/forgot-password">
            重新申请重置
          </Link>
          <Link className="button ghost" href="/login">
            返回登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h2>设置新密码</h2>
      <form className="auth-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="reset-password-input">新密码</label>
          <input
            id="reset-password-input"
            type="password"
            value={password}
            minLength={8}
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 8 个字符"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="reset-confirm">再输入一次</label>
          <input
            id="reset-confirm"
            type="password"
            value={confirm}
            autoComplete="new-password"
            onChange={(event) => setConfirm(event.target.value)}
            required
          />
        </div>

        {error !== null ? (
          <p className="bad small" role="alert">
            {error}
          </p>
        ) : null}

        <button className="button primary" type="submit" disabled={busy}>
          {busy ? '保存中…' : '重置密码'}
        </button>
      </form>
    </div>
  );
}
