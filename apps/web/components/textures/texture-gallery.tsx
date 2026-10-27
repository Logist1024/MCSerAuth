'use client';

import type { CapeTexture, SkinTexture } from '@mcserauth/shared';
import type { ReactNode } from 'react';
import TextureCard from './texture-card';

interface TextureGalleryProps {
  /** Approved skins, newest first. */
  skins?: SkinTexture[];
  /** Approved capes, newest first. */
  capes?: CapeTexture[];
  /** Placeholder shown when both lists are empty. */
  emptyText?: string;
  /** Texture id currently being activated; disables the other controls. */
  busyId?: number | null;
  /** Renders the "设为当前" control when provided. */
  onActivate?: (id: number) => void | Promise<void>;
}

/**
 * Approved skin/cape grid. Activation is opt-in so read-only surfaces can
 * reuse the same layout without exposing write actions.
 */
export default function TextureGallery({
  skins = [],
  capes = [],
  emptyText = '暂无已通过的纹理。',
  busyId = null,
  onActivate,
}: TextureGalleryProps) {
  if (skins.length === 0 && capes.length === 0) {
    return <p className="texture-empty">{emptyText}</p>;
  }

  function activateButton(id: number, active: boolean): ReactNode {
    if (onActivate === undefined) {
      return null;
    }

    return (
      <button
        className="button tiny secondary"
        type="button"
        disabled={active || busyId !== null}
        onClick={() => void onActivate(id)}
      >
        {active ? '当前' : busyId === id ? '切换中…' : '使用'}
      </button>
    );
  }

  return (
    <div className="texture-grid">
      {skins.map((skin) => {
        const id = Number(skin.id);
        const active = skin.state === 'ACTIVE';
        return (
          <TextureCard
            key={`skin-${skin.id}`}
            url={skin.url}
            alt={`皮肤 ${skin.id}`}
            meta={`${skin.variant} · ${skin.state}`}
          >
            {activateButton(id, active)}
          </TextureCard>
        );
      })}
      {capes.map((cape) => {
        const id = Number(cape.id);
        const active = cape.state === 'ACTIVE';
        return (
          <TextureCard
            key={`cape-${cape.id}`}
            url={cape.url}
            alt={`披风 ${cape.id}`}
            meta={cape.state}
          >
            {activateButton(id, active)}
          </TextureCard>
        );
      })}
    </div>
  );
}
