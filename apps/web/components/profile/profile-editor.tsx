'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserSettings } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';

/** Owner-only profile editor shown on the personal homepage. */
export default function ProfileEditor({
  initialAvatarUrl,
  initialSignature,
}: {
  initialAvatarUrl: string;
  initialSignature: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [signature, setSignature] = useState(initialSignature);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await updateUserSettings({
        avatarUrl: avatarUrl.trim() === '' ? null : avatarUrl.trim(),
        signature: signature.trim() === '' ? null : signature.trim(),
      });
      setEditing(false);
      setNotice('资料已保存。');
      router.refresh();
    } catch (saveError) {
      setError(describeApiError(saveError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="side-card">
      <div className="section-heading">
        <h2>个人资料</h2>
        {!editing ? (
          <button
            className="button tiny secondary"
            type="button"
            onClick={() => {
              setEditing(true);
              setNotice(null);
              setError(null);
            }}
          >
            编辑
          </button>
        ) : null}
      </div>

      {notice !== null ? <p className="ok small">{notice}</p> : null}
      {error !== null ? <p className="bad small">{error}</p> : null}

      {editing ? (
        <form className="stack" onSubmit={save}>
          <div className="field">
            <label htmlFor="profile-avatar-url">头像链接</label>
            <input
              id="profile-avatar-url"
              value={avatarUrl}
              placeholder="https://example.com/avatar.png"
              maxLength={500}
              onChange={(event) => setAvatarUrl(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="profile-signature">签名</label>
            <textarea
              id="profile-signature"
              value={signature}
              maxLength={200}
              rows={4}
              placeholder="写一句话介绍自己（最多 200 字）"
              onChange={(event) => setSignature(event.target.value)}
            />
          </div>
          <div className="actions">
            <button className="button small" type="submit" disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </button>
            <button
              className="button ghost small"
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError(null);
                setAvatarUrl(initialAvatarUrl);
                setSignature(initialSignature);
              }}
            >
              取消
            </button>
          </div>
        </form>
      ) : (
        <p className="muted small">头像与签名会展示在你的个人主页和帖子中。</p>
      )}
    </section>
  );
}
