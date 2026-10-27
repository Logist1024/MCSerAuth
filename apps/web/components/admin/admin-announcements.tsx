'use client';

import { useState, type FormEvent } from 'react';
import { adminAnnounce } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';

export default function AdminAnnouncements() {
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await adminAnnounce({
        message: message.trim(),
        link: link.trim() === '' ? null : link.trim(),
      });
      setNotice(`公告已发送给 ${result.recipients} 个账号。`);
      setMessage('');
      setLink('');
    } catch (announceError) {
      setError(describeApiError(announceError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>发布公告</h2>
      <p className="muted">公告以站内信形式发送给所有注册账号。</p>
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="announcement-message">内容</label>
          <textarea
            id="announcement-message"
            value={message}
            maxLength={500}
            rows={4}
            required
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="announcement-link">链接（可选，站内相对路径）</label>
          <input
            id="announcement-link"
            value={link}
            maxLength={500}
            placeholder="/forum/post/1"
            onChange={(event) => setLink(event.target.value)}
          />
        </div>
        {notice !== null ? <p className="ok">{notice}</p> : null}
        {error !== null ? <p className="bad">{error}</p> : null}
        <div className="actions">
          <button className="button" type="submit" disabled={busy}>
            {busy ? '发送中…' : '发送公告'}
          </button>
        </div>
      </form>
    </section>
  );
}
