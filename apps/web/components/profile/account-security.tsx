'use client';

import { useState, type FormEvent } from 'react';
import { changePassword, describeAuthError } from '@/lib/auth-client';
import { changeAccountEmail } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';

/**
 * Owner-only account security panel: password change via better-auth's
 * `/change-password` and email change via `/api/user/email`. Both re-prove the
 * current password; a successful password change rotates this session's cookie
 * and signs out other website sessions.
 */
export default function AccountSecurity({ currentEmail }: { currentEmail: string }) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  return (
    <section className="side-card">
      <div className="section-heading">
        <h2>账号安全</h2>
      </div>

      {!passwordOpen ? (
        <button className="button tiny secondary" type="button" onClick={() => setPasswordOpen(true)}>
          修改密码
        </button>
      ) : (
        <PasswordForm onDone={() => setPasswordOpen(false)} />
      )}

      <div style={{ height: '0.75rem' }} aria-hidden="true" />

      {!emailOpen ? (
        <>
          <p className="muted small">当前邮箱 {currentEmail}</p>
          <button className="button tiny secondary" type="button" onClick={() => setEmailOpen(true)}>
            修改邮箱
          </button>
        </>
      ) : (
        <EmailForm currentEmail={currentEmail} onDone={() => setEmailOpen(false)} />
      )}
    </section>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (newPassword.length < 8) {
      setError('新密码至少 8 个字符');
      return;
    }
    if (newPassword !== confirm) {
      setError('两次输入的新密码不一致');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      setNotice('密码已修改，其他设备的登录已退出。');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setTimeout(onDone, 1500);
    } catch (authError) {
      setError(describeAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="security-current-password">当前密码</label>
        <input
          id="security-current-password"
          type="password"
          value={currentPassword}
          autoComplete="current-password"
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="security-new-password">新密码（至少 8 位）</label>
        <input
          id="security-new-password"
          type="password"
          value={newPassword}
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="security-confirm-password">确认新密码</label>
        <input
          id="security-confirm-password"
          type="password"
          value={confirm}
          autoComplete="new-password"
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
      </div>
      {notice !== null ? <p className="ok small">{notice}</p> : null}
      {error !== null ? (
        <p className="bad small" role="alert">
          {error}
        </p>
      ) : null}
      <div className="actions">
        <button className="button small" type="submit" disabled={busy}>
          {busy ? '提交中…' : '确认修改'}
        </button>
        <button
          className="button ghost small"
          type="button"
          disabled={busy}
          onClick={onDone}
        >
          取消
        </button>
      </div>
    </form>
  );
}

function EmailForm({
  currentEmail,
  onDone,
}: {
  currentEmail: string;
  onDone: () => void;
}) {
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const email = newEmail.trim();
    if (email.toLowerCase() === currentEmail.toLowerCase()) {
      setError('新邮箱与当前邮箱相同');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await changeAccountEmail({ newEmail: email, currentPassword });
      setNotice('邮箱已更新，此后启动器请用新邮箱登录。');
      setTimeout(onDone, 1500);
    } catch (apiError) {
      setError(describeApiError(apiError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="security-new-email">新邮箱</label>
        <input
          id="security-new-email"
          type="email"
          value={newEmail}
          maxLength={200}
          autoComplete="email"
          onChange={(event) => setNewEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="security-email-password">当前密码</label>
        <input
          id="security-email-password"
          type="password"
          value={currentPassword}
          autoComplete="current-password"
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
      </div>
      <p className="muted small">改动会同步到外置登录：启动器要用新邮箱重新登录。</p>
      {notice !== null ? <p className="ok small">{notice}</p> : null}
      {error !== null ? (
        <p className="bad small" role="alert">
          {error}
        </p>
      ) : null}
      <div className="actions">
        <button className="button small" type="submit" disabled={busy}>
          {busy ? '提交中…' : '确认修改'}
        </button>
        <button
          className="button ghost small"
          type="button"
          disabled={busy}
          onClick={onDone}
        >
          取消
        </button>
      </div>
    </form>
  );
}
