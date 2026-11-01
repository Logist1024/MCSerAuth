'use client';

import type { UserSettingsResponse } from '@mcserauth/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { fetchUserSettings, renamePlayer } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { Icon } from '@/components/icons';

/**
 * 改名卡：对齐官方档案页的 "Change name" 交互——收起态展示当前昵称与
 * 冷却状态，展开后才是表单。改名只改昵称，UUID 不变。
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

  if (player === null) {
    return null;
  }

  return (
    <section className="panel rename-card">
      <div className="panel-head">
        <h2>名称</h2>
        <span className="muted small">改名后 UUID 不变</span>
      </div>
      <div className="panel-body">
        {notice !== null ? (
          <p className="ok" role="status">
            {notice}
          </p>
        ) : null}
        {error !== null ? (
          <p className="bad" role="alert">
            {error}
          </p>
        ) : null}

        {cooldownActive ? (
          <div className="rename-cooldown">
            <Icon name="clock" width={16} height={16} />
            <span>
              改名冷却中
              {remainingDays !== null ? `，约还需 ${remainingDays} 天` : ''}（
              {formatDate(renameAvailableAt)} 后可再次改名）。
            </span>
          </div>
        ) : (
          <details className="rename-details">
            <summary className="button secondary small">
              <Icon name="pencil" width={14} height={14} />
              更改名称
            </summary>
            <form className="stack account-form rename-form" onSubmit={submitRename}>
              <div className="field">
                <label htmlFor="player-nickname">新名称</label>
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
                <span className="field-hint">
                  每 30 天可改名一次；旧名字会保留 30 天，期间他人无法占用，到期后可被释放。
                </span>
              </div>
              <div className="actions">
                <button className="button" type="submit" disabled={busy}>
                  {busy ? '提交中…' : '确认改名'}
                </button>
              </div>
            </form>
          </details>
        )}
      </div>
    </section>
  );
}
