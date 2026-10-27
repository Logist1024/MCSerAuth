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
import SkinPreview from './skin-preview';
import TextureLibrary, { type PreviewSelection } from './texture-library';
import TextureUploadForm from './texture-upload-form';

const SESSION_EVENT = 'mcserauth:session-changed';

type UploadKind = 'skin' | 'cape';

function describeUpload(result: TextureUploadResponse): string {
  return `${result.kind === 'skin' ? '皮肤' : '披风'}已上传并设为当前。`;
}

/**
 * Game account manager: character identity and rename, 3D skin preview,
 * uploads and the signed-in player's own texture library.
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
  const [uploadKind, setUploadKind] = useState<UploadKind>('skin');
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
          <p className="page-description">管理游戏角色、皮肤与披风，连接启动器外置登录。</p>
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
        <GameCharacterPanel initialSettings={initialSettings} />
      ) : null}

      <div className="appearance-layout">
        <section className="panel appearance-panel">
          <div className="panel-head">
            <h2>外观预览</h2>
            {textures !== null ? (
              <span className="muted small">{textures.name}</span>
            ) : (
              <span className="muted small">默认形象</span>
            )}
          </div>
          <SkinPreview
            skinUrl={previewSkin?.url ?? null}
            capeUrl={previewCape}
            variant={previewSkin?.variant ?? null}
            playerName={textures?.name ?? null}
            onRefresh={() => void refresh()}
          />
          <div className="appearance-badges">
            <span className="texture-meta">
              皮肤：{activeSkin !== null ? '使用中' : '史蒂夫（默认）'}
            </span>
            <span className="texture-meta">
              披风：
              {activeCape !== null ? '使用中' : capeUnlocked === false ? '未解锁' : '未设置'}
            </span>
          </div>
        </section>

        <section className="panel texture-controls">
          <div className="panel-head">
            <h2>{signedIn ? '上传' : '登录后上传'}</h2>
          </div>
          <div className="panel-body">
            {loading && session === undefined ? <p className="muted">读取形象数据中…</p> : null}
            {!loading && session === null ? (
              <div className="stack">
                <p className="muted">登录后即可上传并切换形象。</p>
                <div>
                  <Link className="button primary" href="/login?next=%2Ftextures">
                    登录 / 注册
                  </Link>
                </div>
              </div>
            ) : null}
            {signedIn ? (
              <div className="texture-uploader">
                <div className="texture-kind-tabs" role="tablist" aria-label="上传类型">
                  <button
                    className={uploadKind === 'skin' ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={uploadKind === 'skin'}
                    onClick={() => setUploadKind('skin')}
                  >
                    皮肤
                  </button>
                  <button
                    className={uploadKind === 'cape' ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={uploadKind === 'cape'}
                    onClick={() => setUploadKind('cape')}
                  >
                    披风
                    {capeUnlocked === false ? (
                      <span className="texture-tab-lock">未解锁</span>
                    ) : null}
                  </button>
                </div>

                {uploadKind === 'skin' ? (
                  <TextureUploadForm
                    idPrefix="skin"
                    fileLabel="皮肤 PNG"
                    submitLabel="上传皮肤"
                    busyLabel="上传中…"
                    hint="64×64 或 64×32 PNG，≤ 1 MiB。"
                    busy={busy === 'skin'}
                    disabled={busy !== null}
                    variant={variant}
                    onVariantChange={setVariant}
                    onSubmit={submitSkin}
                  />
                ) : capeUnlocked === false ? (
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
                    submitLabel="上传披风"
                    busyLabel="上传中…"
                    hint="64×32 PNG，≤ 1 MiB。"
                    busy={busy === 'cape'}
                    disabled={busy !== null}
                    onSubmit={submitCape}
                  />
                )}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {signedIn ? (
        <section className="panel">
          <div className="panel-head">
            <h2>我的皮肤与披风</h2>
            <span className="muted small">点击预览</span>
          </div>
          <div className="panel-body">
            {textures === null ? (
              <p className="muted">加载中…</p>
            ) : (
              <TextureLibrary
                skins={textures.skins}
                capes={textures.capes}
                selectedId={selectedId}
                busyId={activatingId}
                emptyText="上传后会显示在这里。"
                onPreview={preview}
                onActivate={activate}
                onDelete={setDeleteTarget}
              />
            )}
          </div>
        </section>
      ) : null}

      <LauncherGuide />

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
