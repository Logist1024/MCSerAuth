'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { requestPasswordReset } from '@/lib/auth-client';
import CaptchaField from './captcha-field';

/** Step 1 of «forgot password»: email in → one-hour reset link out. */
export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Address the reset mail is on its way to; non-null switches to the hint card. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaActive, setCaptchaActive] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);

  async function send(address: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(address, captchaToken ?? undefined);
      // better-auth answers 200 even for unknown addresses (no account
      // enumeration); the sent view is the only sensible ending either way.
      setSentTo(address);
      setCaptchaReset((current) => current + 1);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : String(authError));
      // The captcha token is consumed before the mail request is processed, so
      // any rejection — including rate limits — burns it.
      setCaptchaReset((current) => current + 1);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await send(email.trim());
  }

  if (sentTo !== null) {
    return (
      <div className="auth-card">
        <h2>重置邮件已发送</h2>
        <p>
          重置链接已发送至 <strong>{sentTo}</strong>（1 小时内有效）。
        </p>
        <p className="small muted">打开邮件里的「重置密码」链接后即可设置新密码。</p>
        <div className="auth-form">
          <Link className="button primary" href="/login">
            返回登录
          </Link>
          {/* The first token is spent, so a resend needs a fresh one — the site
              enforces captcha on this endpoint whenever it is enabled. */}
          <CaptchaField
            onToken={setCaptchaToken}
            onActiveChange={setCaptchaActive}
            resetSignal={captchaReset}
          />
          {error !== null ? (
            <p className="bad small" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="button ghost"
            type="button"
            disabled={busy || (captchaActive && captchaToken === null)}
            onClick={() => void send(sentTo)}
          >
            {busy ? '发送中…' : '重新发送'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h2>忘记密码</h2>
      <p>输入注册邮箱，我们会发送一个 1 小时内有效的重置链接。</p>
      <form className="auth-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="forgot-email">注册邮箱</label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        <CaptchaField
          onToken={setCaptchaToken}
          onActiveChange={setCaptchaActive}
          resetSignal={captchaReset}
        />

        {error !== null ? (
          <p className="bad small" role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="button primary"
          type="submit"
          disabled={busy || (captchaActive && captchaToken === null)}
        >
          {busy ? '发送中…' : '发送重置邮件'}
        </button>
      </form>

      <p className="auth-alt">
        <Link href="/login">想起密码了？返回登录</Link>
      </p>
    </div>
  );
}
