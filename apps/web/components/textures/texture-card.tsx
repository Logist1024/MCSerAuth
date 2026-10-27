import type { ReactNode } from 'react';

interface TextureCardProps {
  /** Caption rendered above the preview (e.g. 当前皮肤). */
  label?: string;
  /** Short-lived signed URL; omitted renders the placeholder instead. */
  url?: string | null;
  alt: string;
  /** Metadata line rendered under the preview. */
  meta?: ReactNode;
  /** Placeholder text when the texture is missing. */
  emptyText?: string;
  /** Extra metadata or controls (activate buttons, review actions). */
  children?: ReactNode;
}

/**
 * Shared texture preview card. Used by the player texture station, account
 * settings and the admin review queue so all surfaces stay visually aligned.
 */
export default function TextureCard({
  label,
  url,
  alt,
  meta,
  emptyText = '暂无纹理',
  children,
}: TextureCardProps) {
  return (
    <div className="texture-card">
      {label !== undefined ? <span className="texture-meta">{label}</span> : null}
      {url ? (
        <img className="texture-preview" src={url} alt={alt} />
      ) : (
        <span className="texture-empty">{emptyText}</span>
      )}
      {meta !== undefined ? <span className="texture-meta">{meta}</span> : null}
      {children}
    </div>
  );
}
