'use client';

import type { UserSettingsResponse } from '@mcserauth/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { fetchUserSettings, renamePlayer } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';

/**
 * Game identity card: nickname, UUID, rename cooldown and name history.
 * Renaming only changes the nickname; the UUID stays stable.
 */
export default function GameCharacterPanel({
  initialSettings,
}: {
  initialSettings: UserSettingsResponse;
}) {
  const [player, setPlayer] = useState(initialSettings.player);
  const [nickname, setNickname] = useState('');
  const [now, setNow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  async function submitRename(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await renamePlayer(nickname.trim());
      setNickname('');
      setNotice(
        `已改名为 ${result.nickname}，下次可改名时间：${formatDate(result.cooldownUntil)}。`,
      );
      try {
        const updated = await fetchUserSettings();
        setPlayer(updated.player);
      } catch {
        setError('改名成功，但资料刷新失败，请手动刷新页面。');
      }
    } catch (renameError) {
      setError(describeApiError(renameError));
    } finally {
      setBusy(false);
    }
  }

  const renameAvailableAt = player?.renameAvailableAt ?? null;
  const cooldownActive =
    renameAvailableAt !== null && (now === null || new Date(renameAvailableAt).getTime() > now);
  const remainingDays =
    renameAvailableAt !== null && now !== null
      ? Math.max(0, Math.ceil((new Date(renameAvailableAt).getTime() - now) / 86_400_000))
      : null;

  return (
    <section className="card">
      <div className="section-heading">
        <h2>游戏角色</h2>
        <span className="muted small">改名后 UUID 不变</span>
      </div>

      {player === null ? (
        <p className="muted">尚未创建游戏角色，首次启动器授权或上传纹理会自动创建。</p>
      ) : (
        <div className="stack">
          {notice !== null ? <p className="ok">{notice}</p> : null}
          {error !== null ? <p className="bad">{error}</p> : null}

          <dl className="info-grid">
            <div className="info-item">
              <dt>昵称</dt>
              <dd>{player.nickname}</dd>
            </div>
            <div className="info-item">
              <dt>UUID</dt>
              <dd className="mono">{player.uuid}</dd>
            </div>
            <div className="info-item">
              <dt>创建于</dt>
              <dd>{formatDate(player.createdAt)}</dd>
            </div>
            <div className="info-item">
              <dt>上次改名</dt>
              <dd>{player.nameCooldownAt ? formatDateTime(player.nameCooldownAt) : '从未改名'}</dd>
            </div>
            <div className="info-item">
              <dt>曾用名</dt>
              <dd>{player.nicknameHistory.join(' → ') || '无'}</dd>
            </div>
          </dl>

          {cooldownActive ? (
            <p className="muted small">
              改名冷却中
              {remainingDays !== null ? `，约还需 ${remainingDays} 天` : ''}。
            </p>
          ) : (
            <form className="stack account-form" onSubmit={submitRename}>
              <div className="field">
                <label htmlFor="player-nickname">新昵称</label>
                <input
                  id="player-nickname"
                  value={nickname}
                  minLength={3}
                  maxLength={16}
                  pattern="[A-Za-z0-9_]+"
                  placeholder="3–16 位字母、数字或下划线"
                  onChange={(event) => setNickname(event.target.value)}
                  required
                />
                <span className="field-hint">30 天冷却，旧名保留 30 天。</span>
              </div>
              <div className="actions">
                <button className="button" type="submit" disabled={busy}>
                  {busy ? '提交中…' : '改名'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
