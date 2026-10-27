'use client';

import type { CapeTexture, SkinTexture } from '@mcserauth/shared';
import type { ReactNode } from 'react';

export type PreviewSelection = {
  kind: 'skin' | 'cape';
  id: number;
  url: string;
  variant: 'classic' | 'slim' | null;
};

interface TextureLibraryProps {
  skins?: SkinTexture[];
  capes?: CapeTexture[];
  selectedId?: number | null;
  busyId?: number | null;
  emptyText?: string;
  onPreview?: (selection: PreviewSelection) => void;
  onActivate?: (id: number) => void | Promise<void>;
  onDelete?: (id: number) => void;
}

/**
 * Selectable skin/cape library. A click previews the texture in the 3D viewer;
 * explicit buttons switch or delete it.
 */
export default function TextureLibrary({
  skins = [],
  capes = [],
  selectedId = null,
  busyId = null,
  emptyText = '还没有上传过纹理。',
  onPreview,
  onActivate,
  onDelete,
}: TextureLibraryProps) {
  if (skins.length === 0 && capes.length === 0) {
    return <p className="texture-empty">{emptyText}</p>;
  }

  function actions(id: number, active: boolean): ReactNode {
    return (
      <div className="texture-actions">
        {onActivate !== undefined ? (
          <button
            className="button tiny secondary"
            type="button"
            disabled={active || busyId !== null}
            onClick={() => void onActivate(id)}
          >
            {active ? '当前' : busyId === id ? '切换中…' : '使用'}
          </button>
        ) : null}
        {onDelete !== undefined ? (
          <button
            className="button tiny ghost-danger"
            type="button"
            disabled={busyId !== null}
            onClick={() => onDelete(id)}
          >
            删除
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="texture-library">
      {skins.length > 0 ? (
        <div className="texture-library-group">
          <h4 className="texture-library-title">皮肤</h4>
          <div className="texture-grid">
            {skins.map((skin) => {
              const id = Number(skin.id);
              const active = skin.state === 'ACTIVE';
              return (
                <div
                  className={`texture-card${selectedId === id ? ' selected' : ''}${
                    active ? ' active' : ''
                  }`}
                  key={`skin-${skin.id}`}
                >
                  <button
                    className="texture-thumb"
                    type="button"
                    onClick={() =>
                      onPreview?.({
                        kind: 'skin',
                        id,
                        url: skin.url,
                        variant: skin.variant === 'SLIM' ? 'slim' : 'classic',
                      })
                    }
                    aria-label={`预览皮肤 #${skin.id}`}
                  >
                    <img className="texture-preview" src={skin.url} alt={`皮肤 ${skin.id}`} />
                  </button>
                  <span className="texture-meta">
                    {skin.variant === 'SLIM' ? 'Alex' : 'Steve'}
                    {active ? ' · 当前' : ''}
                  </span>
                  {actions(id, active)}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {capes.length > 0 ? (
        <div className="texture-library-group">
          <h4 className="texture-library-title">披风</h4>
          <div className="texture-grid">
            {capes.map((cape) => {
              const id = Number(cape.id);
              const active = cape.state === 'ACTIVE';
              return (
                <div
                  className={`texture-card${selectedId === id ? ' selected' : ''}${
                    active ? ' active' : ''
                  }`}
                  key={`cape-${cape.id}`}
                >
                  <button
                    className="texture-thumb"
                    type="button"
                    onClick={() =>
                      onPreview?.({
                        kind: 'cape',
                        id,
                        url: cape.url,
                        variant: null,
                      })
                    }
                    aria-label={`预览披风 #${cape.id}`}
                  >
                    <img className="texture-preview" src={cape.url} alt={`披风 ${cape.id}`} />
                  </button>
                  <span className="texture-meta">{active ? '当前' : '披风'}</span>
                  {actions(id, active)}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
