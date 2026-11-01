'use client';

import type { MinecraftProfileResponse, UserSettingsResponse } from '@mcserauth/shared';
import { useState } from 'react';
import { formatDate, formatDateTime } from '@/lib/format';
import SkinPreview from './skin-preview';

function formatUuid(uuid: string): string {
  if (uuid.length !== 32) {
    return uuid;
  }
  return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
}

/**
 * 官方档案页风格的档案头：左侧 3D 形象预览，右侧玩家名、UUID 与
 * 皮肤/披风使用状态，对应 minecraft.net 的 profile 页头。
 */
export default function ProfileHeader({
  settings,
  textures,
  capeUnlocked,
  previewSkin,
  previewCape,
  onPreviewRefresh,
}: {
  settings: UserSettingsResponse;
  textures: MinecraftProfileResponse | null;
  capeUnlocked: boolean | null;
  previewSkin: { url: string; variant: 'classic' | 'slim' } | null;
  previewCape: string | null;
  onPreviewRefresh: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const player = settings.player;
  const uuid = textures?.id ?? player?.uuid ?? null;
  const name = textures?.name ?? player?.nickname ?? null;
  const activeSkin = textures?.skins.find((skin) => skin.state === 'ACTIVE') ?? null;
  const activeCape = textures?.capes.find((cape) => cape.state === 'ACTIVE') ?? null;

  async function copyUuid(): Promise<void> {
    if (uuid === null) {
      return;
    }
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(formatUuid(uuid));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <section className="panel profile-header">
      <div className="profile-header-preview">
        <SkinPreview
          skinUrl={previewSkin?.url ?? null}
          capeUrl={previewCape}
          variant={previewSkin?.variant ?? null}
          playerName={textures?.name ?? null}
          onRefresh={onPreviewRefresh}
        />
      </div>
      <div className="profile-header-identity">
        <div className="profile-header-name-row">
          <h2 className="profile-header-name">{name ?? '尚未创建游戏角色'}</h2>
          <span className={`profile-header-state${activeSkin !== null ? ' on' : ''}`}>
            {activeSkin !== null ? '自定义皮肤使用中' : '默认形象（史蒂夫）'}
          </span>
          {activeCape !== null ? (
            <span className="profile-header-state on">披风使用中</span>
          ) : capeUnlocked === false ? (
            <span className="profile-header-state">披风未解锁</span>
          ) : null}
        </div>

        {uuid !== null ? (
          <div className="profile-header-uuid">
            <code>{formatUuid(uuid)}</code>
            <button className="button tiny secondary" type="button" onClick={() => void copyUuid()}>
              {copied ? '已复制' : '复制 UUID'}
            </button>
            {copyFailed ? <span className="bad small">复制失败，请手动复制。</span> : null}
          </div>
        ) : null}

        {player !== null ? (
          <dl className="profile-header-meta">
            <div>
              <dt>创建于</dt>
              <dd>{formatDate(player.createdAt)}</dd>
            </div>
            <div>
              <dt>上次改名</dt>
              <dd>{player.nameCooldownAt ? formatDateTime(player.nameCooldownAt) : '从未改名'}</dd>
            </div>
            <div>
              <dt>曾用名</dt>
              <dd>{player.nicknameHistory.join(' → ') || '无'}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted small">首次启动器授权或上传纹理后会自动创建游戏角色。</p>
        )}
      </div>
    </section>
  );
}
