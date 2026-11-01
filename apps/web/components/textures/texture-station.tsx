'use client';

import type {
  MinecraftProfileResponse,
  SkinVariant,
  TextureUploadResponse,
  UserSettingsResponse,
} from '@mcserauth/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  activateTexture,
  deleteMyTexture,
  fetchGrowthOverview,
  fetchMyTextures,
  uploadMyCape,
  uploadMySkin,
} from '@/lib/api-client';
import { fetchWebsiteSession, type WebsiteSession } from '@/lib/auth-client';
import { describeApiError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import ConfirmDialog from '@/components/confirm-dialog';
import GameCharacterPanel from '@/components/account/game-character-panel';
import LauncherGuide from '@/components/account/launcher-guide';
import ProfileHeader from './profile-header';
import TextureLibrary, { type PreviewSelection } from './texture-library';
import TextureUploadForm from './texture-upload-form';

const SESSION_EVENT = 'mcserauth:session-changed';

type UploadKind = 'skin' | 'cape';

function describeUpload(result: TextureUploadResponse): string {
  return `${result.kind === 'skin' ? '皮肤' : '披风'}已上传并设为当前。`;
}

/**
 * 游戏账号管理：官方档案页式布局——档案头（3D 预览 + 名称/UUID）+
 * 改名卡 + 皮肤卡 + 披风卡，启动器指南折叠在页尾。
 */
export default function TextureStation({
  initialSettings,
}: {
  initialSettings: UserSettingsResponse | null;
}) {
  const [session, setSession] = useState<WebsiteSession | null | undefined>(undefined);
  const [textures, setTextures] = useState<MinecraftProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<UploadKind | null>(null);
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [capeUnlocked, setCapeUnlocked] = useState<boolean | null>(null);

  const [variant, setVariant] = useState<SkinVariant>('classic');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [previewSkin, setPreviewSkin] = useState<{ url: string; variant: SkinVariant } | null>(
    null,
  );
  const [previewCape, setPreviewCape] = useState<string | null>(null);

  const applyActivePreview = useCallback((current: MinecraftProfileResponse | null) => {
    const activeSkin = current?.skins.find((skin) => skin.state === 'ACTIVE') ?? null;
    const activeCape = current?.capes.find((cape) => cape.state === 'ACTIVE') ?? null;
    setPreviewSkin(
      activeSkin === null
        ? null
        : { url: activeSkin.url, variant: activeSkin.variant === 'SLIM' ? 'slim' : 'classic' },
    );
    setPreviewCape(activeCape?.url ?? null);
    setSelectedId(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await fetchWebsiteSession();
      setSession(current);
      if (current === null) {
        setTextures(null);
        setCapeUnlocked(null);
        applyActivePreview(null);
        return;
      }
      const [mine, growth] = await Promise.all([
        fetchMyTextures(),
        fetchGrowthOverview().catch(() => null),
      ]);
      setTextures(mine);
      setCapeUnlocked(growth?.progress.capeUnlocked ?? null);
      applyActivePreview(mine);
    } catch (refreshError) {
      setError(describeApiError(refreshError));
    } finally {
      setLoading(false);
    }
  }, [applyActivePreview]);

  useEffect(() => {
    void refresh();
    const onSessionChanged = (): void => {
      setNotice(null);
      void refresh();
    };
    window.addEventListener(SESSION_EVENT, onSessionChanged);
    return () => window.removeEventListener(SESSION_EVENT, onSessionChanged);
  }, [refresh]);

  async function submitSkin(file: File): Promise<boolean> {
    setError(null);
    setNotice(null);
    setBusy('skin');
    try {
      const result = await uploadMySkin(file, variant);
      setNotice(describeUpload(result));
      await refresh();
      return true;
    } catch (uploadError) {
      setError(describeApiError(uploadError));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function submitCape(file: File): Promise<boolean> {
    setError(null);
    setNotice(null);
    setBusy('cape');
    try {
      const result = await uploadMyCape(file);
      setNotice(describeUpload(result));
      await refresh();
      return true;
    } catch (uploadError) {
      setError(describeApiError(uploadError));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function activate(id: number): Promise<void> {
    setActivatingId(id);
    setError(null);
    setNotice(null);
    try {
      await activateTexture(id);
      const mine = await fetchMyTextures();
      setTextures(mine);
      applyActivePreview(mine);
      setNotice('已切换形象。');
    } catch (activateError) {
      setError(describeApiError(activateError));
    } finally {
      setActivatingId(null);
    }
  }

  async function remove(): Promise<void> {
    if (deleteTarget === null) {
      return;
    }
    const id = deleteTarget;
    setActivatingId(id);
    setError(null);
    setNotice(null);
    try {
      await deleteMyTexture(id);
      setDeleteTarget(null);
      const mine = await fetchMyTextures();
      setTextures(mine);
      applyActivePreview(mine);
      setNotice('已删除，当前形象回退为史蒂夫。');
    } catch (deleteError) {
      setError(describeApiError(deleteError));
    } finally {
      setActivatingId(null);
    }
  }

  function preview(selection: PreviewSelection): void {
    setSelectedId(selection.id);
    if (selection.kind === 'skin') {
      setPreviewSkin({ url: selection.url, variant: selection.variant ?? 'classic' });
    } else {
      setPreviewCape(selection.url);
    }
  }

  const activeSkin = textures?.skins.find((skin) => skin.state === 'ACTIVE') ?? null;
  const activeCape = textures?.capes.find((cape) => cape.state === 'ACTIVE') ?? null;
  const signedIn = session !== null && session !== undefined;

  return (
    <>
      <header className="page-head station-head">
        <div>
          <h1>游戏账号管理</h1>
          <p className="page-description">管理游戏档案：名称、皮肤与披风，连接启动器外置登录。</p>
        </div>
        <span className="station-badge">PNG · 64×64 / 64×32</span>
      </header>

      {error !== null ? (
        <p className="bad" role="alert">
          {error}
        </p>
      ) : null}
      {notice !== null ? (
        <p className="ok" role="status">
          {notice}
        </p>
      ) : null}

      {initialSettings?.user.banned ? <p className="bad">该账号已被论坛封禁。</p> : null}
      {initialSettings !== null &&
      initialSettings.user.mutedUntil !== null &&
      new Date(initialSettings.user.mutedUntil).getTime() > Date.now() ? (
        <p className="bad">
          该账号处于禁言状态，解除时间：{formatDateTime(initialSettings.user.mutedUntil)}。
        </p>
      ) : null}

      {signedIn && initialSettings !== null ? (
        <>
          <ProfileHeader
            settings={initialSettings}
            textures={textures}
            capeUnlocked={capeUnlocked}
            previewSkin={previewSkin}
            previewCape={previewCape}
            onPreviewRefresh={() => void refresh()}
          />

          <GameCharacterPanel initialSettings={initialSettings} />

          <section className="panel texture-section" aria-labelledby="skin-section-heading">
            <div className="panel-head">
              <h2 id="skin-section-heading">皮肤</h2>
              <span className={`texture-section-state${activeSkin !== null ? ' on' : ''}`}>
                {activeSkin !== null ? '自定义皮肤使用中' : '默认形象（史蒂夫）'}
              </span>
            </div>
            <div className="panel-body texture-section-body">
              {textures === null && loading ? <p className="muted">读取形象数据中…</p> : null}
              <TextureUploadForm
                idPrefix="skin"
                fileLabel="皮肤 PNG"
                submitLabel="上传并使用"
                busyLabel="上传中…"
                hint="64×64 或 64×32 PNG，≤ 1 MiB；上传后立即生效。"
                busy={busy === 'skin'}
                disabled={busy !== null}
                variant={variant}
                onVariantChange={setVariant}
                onSubmit={submitSkin}
              />
              <TextureLibrary
                skins={textures?.skins ?? []}
                selectedId={selectedId}
                busyId={activatingId}
                emptyText="还没有上传过皮肤。"
                onPreview={preview}
                onActivate={activate}
                onDelete={setDeleteTarget}
              />
            </div>
          </section>

          <section className="panel texture-section" aria-labelledby="cape-section-heading">
            <div className="panel-head">
              <h2 id="cape-section-heading">披风</h2>
              <span
                className={`texture-section-state${
                  activeCape !== null ? ' on' : capeUnlocked === false ? '' : ''
                }`}
              >
                {activeCape !== null ? '披风使用中' : capeUnlocked === false ? '未解锁' : '未设置'}
              </span>
            </div>
            <div className="panel-body texture-section-body">
              {capeUnlocked === false ? (
                <div className="texture-unlock">
                  <p>披风需要先在成长中心用积分解锁。</p>
                  <Link className="button secondary small" href="/forum/growth">
                    前往解锁
                  </Link>
                </div>
              ) : (
                <TextureUploadForm
                  idPrefix="cape"
                  fileLabel="披风 PNG"
                  submitLabel="上传并使用"
                  busyLabel="上传中…"
                  hint="64×32 PNG，≤ 1 MiB；上传后立即生效。"
                  busy={busy === 'cape'}
                  disabled={busy !== null}
                  onSubmit={submitCape}
                />
              )}
              <TextureLibrary
                capes={textures?.capes ?? []}
                selectedId={selectedId}
                busyId={activatingId}
                emptyText="还没有披风。"
                onPreview={preview}
                onActivate={activate}
                onDelete={setDeleteTarget}
              />
            </div>
          </section>
        </>
      ) : session === null ? (
        <section className="panel">
          <div className="panel-body">
            <div className="stack">
              <p className="muted">登录后即可管理游戏档案、上传并切换形象。</p>
              <div>
                <Link className="button primary" href="/login?next=%2Ftextures">
                  登录 / 注册
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <details className="launcher-fold">
        <summary>连接启动器（外置登录）指南</summary>
        <LauncherGuide />
      </details>

      <ConfirmDialog
        open={deleteTarget !== null}
        tone="danger"
        title="删除这个纹理？"
        description="删除后无法恢复；当前形象会回退为史蒂夫。"
        confirmLabel="删除"
        busy={activatingId !== null}
        onConfirm={() => void remove()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
