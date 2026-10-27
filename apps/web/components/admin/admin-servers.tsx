'use client';

import type { AdminServerEntry } from '@mcserauth/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminCreateServer, adminListServers, adminUpdateServer } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { formatDate } from '@/lib/format';

export default function AdminServers() {
  const [servers, setServers] = useState<AdminServerEntry[] | null>(null);
  const [serverId, setServerId] = useState('');
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | 'create' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setServers(await adminListServers());
    } catch (fetchError) {
      setError(describeApiError(fetchError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy('create');
    setError(null);
    setCreatedSecret(null);
    try {
      const result = await adminCreateServer({
        serverId: serverId.trim(),
        name: name.trim(),
        secret: secret.trim() === '' ? undefined : secret.trim(),
      });
      setCreatedSecret(result.secret ?? null);
      setServerId('');
      setName('');
      setSecret('');
      await load();
    } catch (createError) {
      setError(describeApiError(createError));
    } finally {
      setBusy(null);
    }
  }

  async function toggle(server: AdminServerEntry): Promise<void> {
    setBusy(server.id);
    setError(null);
    try {
      await adminUpdateServer(server.id, { enabled: !server.enabled });
      await load();
    } catch (toggleError) {
      setError(describeApiError(toggleError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card">
      <h2>服务器白名单</h2>
      <p className="muted">
        joinServer/hasJoined 只接受已登记且启用的 serverId；密钥只存哈希，明文仅在创建时显示一次。
      </p>

      {createdSecret !== null ? (
        <p className="ok">
          服务器密钥（只显示一次，请立即保存）：<code>{createdSecret}</code>
        </p>
      ) : null}
      {error !== null ? <p className="bad">{error}</p> : null}

      <form className="stack" onSubmit={create}>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="server-id">serverId</label>
            <input
              id="server-id"
              value={serverId}
              pattern="[A-Za-z0-9._-]{1,64}"
              onChange={(event) => setServerId(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="server-name">名称</label>
            <input
              id="server-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="server-secret">密钥（可选，留空自动生成）</label>
          <input
            id="server-secret"
            value={secret}
            minLength={8}
            maxLength={128}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="至少 8 位"
          />
        </div>
        <div className="actions">
          <button className="button" type="submit" disabled={busy !== null}>
            {busy === 'create' ? '登记中…' : '登记服务器'}
          </button>
        </div>
      </form>

      {servers === null ? <p className="muted">加载中…</p> : null}
      {servers !== null && servers.length === 0 ? (
        <p className="texture-empty">尚无服务器。</p>
      ) : null}
      {servers !== null && servers.length > 0 ? (
        <ul className="admin-list">
          {servers.map((server) => (
            <li className="admin-list-item" key={server.id}>
              <div>
                <strong>{server.name}</strong>
                <span className={server.enabled ? 'ok small' : 'bad small'}>
                  {' '}
                  {server.enabled ? '启用' : '停用'}
                </span>
                <p className="muted small">
                  {server.serverId} · 登记于 {formatDate(server.createdAt)}
                </p>
              </div>
              <button
                className="button tiny secondary"
                type="button"
                disabled={busy !== null}
                onClick={() => void toggle(server)}
              >
                {server.enabled ? '停用' : '启用'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
