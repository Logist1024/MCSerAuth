/**
 * Level & special-title badges shared across the growth centre, forum lists and
 * public profiles. This module is intentionally hook-free and directive-free so
 * it can render inside both Server and Client Components.
 */
import { LEVEL_TIERS } from '@mcserauth/shared';
import { Icon } from '@/components/icons';
import './growth.css';

/** Author badge shape carried inline by the forum contracts (`ForumAuthor`). */
export interface BadgeAuthor {
  level: number | null;
  levelTier: string | null;
  title: { name: string; color: string } | null;
}

function tierColorForName(name: string): string {
  return LEVEL_TIERS.find((tier) => tier.name === name)?.color ?? 'var(--muted)';
}

export function TitleBadge({
  name,
  color,
  size = 'sm',
}: {
  name: string;
  color: string;
  size?: 'sm' | 'lg';
}) {
  return (
    <span
      className={`growth-badge growth-badge-title${size === 'lg' ? ' growth-badge-lg' : ''}`}
      style={{ color }}
      title={`称号：${name}`}
    >
      <Icon name="star" width={size === 'lg' ? 13 : 11} height={size === 'lg' ? 13 : 11} />
      {name}
    </span>
  );
}

export function LevelBadge({
  level,
  tierName,
  size = 'sm',
}: {
  level: number;
  tierName: string;
  size?: 'sm' | 'lg';
}) {
  const color = tierColorForName(tierName);
  return (
    <span
      className={`growth-badge growth-badge-level${size === 'lg' ? ' growth-badge-lg' : ''}`}
      style={{ color }}
      title={`等级 Lv.${level} · ${tierName}`}
    >
      <span className="growth-badge-dot" aria-hidden="true" />
      Lv.{level} {tierName}
    </span>
  );
}

/**
 * Renders the correct badge for a forum author / profile owner.
 * A special title is mutually exclusive with the level badge: when present it
 * wins and the level is not shown.
 */
export function UserBadges({ author }: { author: BadgeAuthor }) {
  if (author.title != null) {
    return <TitleBadge name={author.title.name} color={author.title.color} />;
  }
  if (author.level != null) {
    return <LevelBadge level={author.level} tierName={author.levelTier ?? '初来乍到'} />;
  }
  return null;
}
