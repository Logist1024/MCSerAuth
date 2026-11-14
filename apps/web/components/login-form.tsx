'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, startTransition, type FormEvent } from 'react';
import {
  signInWithEmail,
  signUpWithEmail,
  fetchWebsiteSession,
  signOut,
  resendVerificationEmail,
  describeAuthError,
  isUnverifiedEmailError,
  type WebsiteSession,
} from '@/lib/auth-client';
import CaptchaField from './captcha-field';
import PasswordInput from './password-input';
import { useToast } from './toast';
import { passwordStrength } from '@/lib/password-strength';
import { isSafeRelativePath } from '@/lib/safe-path';

function safeNext(value: string | null): string {
  return isSafeRelativePath(value) ? value : '/forum';
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const next = safeNext(searchParams.get('next'));
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [session, setSession] = useState<WebsiteSession | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaActive, setCaptchaActive] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);
  /** Email address whose verification mail is on its way (post sign-up). */
  const [pendingVerification, setPendingVerification] = useState<string | null>(null);
  /** Sign-in was rejected because the address is not verified yet. */
  const [unverifiedHint, setUnverifiedHint] = useState<string | null>(null);
  /** Seconds until the verification-mail resend button unlocks again. */
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    let active = true;
    fetchWebsiteSession()
      .then((current) => {
        if (active) {
          setSession(current);
        }
      })
      .catch(() => {
        if (active) {
          setSession(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (resendCooldown === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (mode === 'signup' && name.trim().length < 2) {
      setError('昵称至少需要 2 个字符');
      return;
    }
    if (mode === 'signup' && password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setBusy(true);
    setError(null);
    setUnverifiedHint(null);
    try {
      if (mode === 'signup') {
        await signUpWithEmail(
          { email: email.trim(), password, name: name.trim() },
          captchaToken ?? undefined,
          next,
        );
        // Sign-up without verification leaves the account logged out; guide
        // the user through the email round-trip instead of navigating away.
        setPendingVerification(email.trim());
        toast.success('注册成功！验证邮件已发送，请到邮箱完成验证');
        setBusy(false);
        return;
      }
      await signInWithEmail({ email: email.trim(), password }, captchaToken ?? undefined);
      window.dispatchEvent(new Event('mcserauth:session-changed'));
      toast.success('登录成功');
      // The destination route suspends behind a loading boundary; an unwrapped
      // navigation from this synchronous handler makes React abort the render.
      startTransition(() => {
        router.replace(next);
        router.refresh();
      });
    } catch (authError) {
      setError(describeAuthError(authError));
      if (mode === 'signin' && isUnverifiedEmailError(authError)) {
        setUnverifiedHint(email.trim());
      }
      // The captcha token is consumed by better-auth before credentials are
      // checked, so any rejection — including a wrong password — burns it.
      setCaptchaReset((current) => current + 1);
      setBusy(false);
    }
  }

  async function resend(to: string, nextPath: string): Promise<void> {
    setBusy(true);
    try {
      await resendVerificationEmail(to, nextPath);
      toast.success('验证邮件已重新发送，请查收');
      setResendCooldown(60);
    } catch (authError) {
      toast.error(describeAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode: 'signin' | 'signup'): void {
    setMode(nextMode);
    setError(null);
    setPendingVerification(null);
    setUnverifiedHint(null);
    setConfirm('');
    setCaptchaReset((current) => current + 1);
  }

  async function switchAccount(): Promise<void> {
    setBusy(true);
    try {
      await signOut();
      setSession(null);
      window.dispatchEvent(new Event('mcserauth:session-changed'));
      toast.info('已退出当前账号');
    } catch (authError) {
      toast.error(describeAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  if (session === undefined) {
    return (
      <div className="auth-card">
        <h2>正在读取登录状态…</h2>
        <p>稍等一下，马上就好。</p>
      </div>
    );
  }

  if (session !== null) {
    return (
      <div className="auth-card">
        <h2>你已登录</h2>
        {searchParams.get('verified') === '1' ? (
          <p className="ok small">邮箱验证成功，已自动登录。</p>
        ) : null}
        <p>
          当前账号 <strong>{session.user.name}</strong>（{session.user.email}）。
        </p>
        <div className="auth-form">
          <Link className="button primary" href={next}>
            继续前往
          </Link>
          <button
            className="button ghost"
            type="button"
            onClick={() => void switchAccount()}
            disabled={busy}
          >
            {busy ? '退出中…' : '切换账号'}
          </button>
        </div>
      </div>
    );
  }

  if (pendingVerification !== null) {
    return (
      <div className="auth-card">
        <h2>请完成邮箱验证</h2>
        <p>
          验证邮件已发送至 <strong>{pendingVerification}</strong>。
        </p>
        <p className="small muted">打开邮箱点击「完成验证」链接，验证成功后将自动登录本站。</p>
        <div className="auth-form">
          <button
            className="button ghost"
            type="button"
            disabled={busy || resendCooldown > 0}
            onClick={() => void resend(pendingVerification, next)}
          >
            {busy
              ? '发送中…'
              : resendCooldown > 0
                ? `重新发送（${resendCooldown}s）`
                : '重新发送验证邮件'}
          </button>
          <Link className="button ghost" href="/forum">
            先去论坛看看
          </Link>
        </div>
        <p className="auth-alt small muted">
          收不到？请检查垃圾邮件，或确认邮箱地址无误后重新注册。
        </p>
      </div>
    );
  }

  const strength = passwordStrength(password);

  return (
    <div className="auth-card">
      <div className="auth-switch" role="tablist" aria-label="登录或注册">
        <button
          className={mode === 'signin' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={mode === 'signin'}
          onClick={() => switchMode('signin')}
        >
          登录
        </button>
        <button
          className={mode === 'signup' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          onClick={() => switchMode('signup')}
        >
          注册
        </button>
      </div>

      <h2>{mode === 'signin' ? '登录' : '创建账号'}</h2>
      {mode === 'signup' ? <p>注册后即可使用论坛、游戏账号与游戏外置登录。</p> : null}

      <form className="auth-form" onSubmit={submit}>
        {mode === 'signup' ? (
          <div className="field">
            <label htmlFor="login-name">昵称</label>
            <input
              id="login-name"
              value={name}
              minLength={2}
              maxLength={32}
              autoComplete="nickname"
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              placeholder="社区里显示的名字"
              required
            />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="login-email">邮箱</label>
          <input
            id="login-email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="login-password">密码</label>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={(value) => {
              setPassword(value);
              setError(null);
            }}
            minLength={8}
            maxLength={128}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder={mode === 'signup' ? '至少 8 个字符' : '输入密码'}
            required
          />
        </div>

        {mode === 'signup' ? (
          <>
            <div className="field">
              <label htmlFor="login-confirm">再输入一次密码</label>
              <PasswordInput
                id="login-confirm"
                value={confirm}
                onChange={(value) => {
                  setConfirm(value);
                  setError(null);
                }}
                maxLength={128}
                autoComplete="new-password"
                placeholder="和上面保持一致"
                required
              />
              {confirm.length > 0 && confirm !== password ? (
                <p className="bad small">两次输入的密码不一致</p>
              ) : null}
            </div>
            {password.length > 0 ? (
              <div className="strength-meter" aria-live="polite">
                <div className="strength-bar" aria-hidden="true">
                  {[1, 2, 3].map((segment) => (
                    <span
                      key={segment}
                      className={`strength-segment${strength.score >= segment ? ' on' : ''}`}
                    />
                  ))}
                </div>
                <span className="strength-label small muted">{strength.label}</span>
              </div>
            ) : null}
          </>
        ) : null}

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

        {unverifiedHint !== null ? (
          <button
            className="button ghost"
            type="button"
            disabled={busy || resendCooldown > 0}
            onClick={() => void resend(unverifiedHint, next)}
          >
            {busy
              ? '发送中…'
              : resendCooldown > 0
                ? `重新发送（${resendCooldown}s）`
                : '重新发送验证邮件'}
          </button>
        ) : null}

        <button
          className="button primary"
          type="submit"
          disabled={busy || (captchaActive && captchaToken === null)}
        >
          {busy ? '处理中…' : mode === 'signup' ? '注册（将发送验证邮件）' : '登录'}
        </button>
      </form>

      <p className="auth-alt">
        {mode === 'signin' ? <Link href="/forgot-password">忘记密码？</Link> : null}
        <Link href="/forum">先去论坛看看</Link>
      </p>
    </div>
  );
}
