import type { HTMLAttributes, ReactNode } from 'react';

export type IconName =
  | 'alert'
  | 'arrowLeft'
  | 'at'
  | 'bell'
  | 'bold'
  | 'check'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronUp'
  | 'clock'
  | 'code'
  | 'flag'
  | 'gamepad'
  | 'heading'
  | 'home'
  | 'image'
  | 'inbox'
  | 'italic'
  | 'link'
  | 'list'
  | 'lock'
  | 'logout'
  | 'message'
  | 'pencil'
  | 'pen'
  | 'pin'
  | 'plus'
  | 'quote'
  | 'reply'
  | 'rss'
  | 'search'
  | 'settings'
  | 'shield'
  | 'star'
  | 'thumbsUp'
  | 'trash'
  | 'user'
  | 'x';

const PATHS: Record<IconName, ReactNode> = {
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ),
  at: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  bold: (
    <>
      <path d="M6 4h8a4 4 0 0 1 0 8H6Z" />
      <path d="M6 12h9a4 4 0 0 1 0 8H6Z" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronUp: <path d="m18 15-6-6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  code: (
    <>
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </>
  ),
  flag: (
    <>
      <path d="M4 22V4" />
      <path d="M4 4h12l-2 4 2 4H4" />
    </>
  ),
  gamepad: (
    <>
      <path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.58L2 17.5a2.5 2.5 0 0 0 4.3 1.9L9 16h6l2.7 3.4a2.5 2.5 0 0 0 4.3-1.9l-.7-8.92A4 4 0 0 0 17.32 5Z" />
      <path d="M6 12h4" />
      <path d="M8 10v4" />
      <path d="M15 13h.01" />
      <path d="M18 11h.01" />
    </>
  ),
  heading: (
    <>
      <path d="M6 4v16" />
      <path d="M18 4v16" />
      <path d="M6 12h12" />
    </>
  ),
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M9 22V12h6v10" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </>
  ),
  italic: (
    <>
      <path d="M19 4h-9" />
      <path d="M14 20H5" />
      <path d="M15 4 9 20" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  pencil: (
    <>
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </>
  ),
  pen: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  pin: (
    <>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  quote: (
    <>
      <path d="M10 11H6a2 2 0 0 1 0-4h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6" />
      <path d="M19 11h-4a2 2 0 0 1 0-4h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1" />
    </>
  ),
  reply: (
    <>
      <path d="m9 17-5-5 5-5" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </>
  ),
  rss: (
    <>
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  settings: (
    <>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M2 14h4" />
      <path d="M10 8h4" />
      <path d="M18 16h4" />
    </>
  ),
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9Z" />,
  thumbsUp: (
    <>
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 15H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    </>
  ),
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
};

/**
 * Emoji 替代表（外观设置里选 "Emoji 图标" 时整体替换线条 SVG）。
 * 编辑器工具类的 bold/italic/heading 用字母字符更可读，保留为纯文本。
 */
const EMOJI: Record<IconName, string> = {
  alert: '⚠️',
  arrowLeft: '⬅️',
  at: '@',
  bell: '🔔',
  bold: 'B',
  check: '✅',
  chevronDown: '▾',
  chevronLeft: '◂',
  chevronRight: '▸',
  chevronUp: '▴',
  clock: '🕒',
  code: '</>',
  flag: '🚩',
  gamepad: '🎮',
  heading: 'H',
  home: '🏠',
  image: '🖼️',
  inbox: '📥',
  italic: 'I',
  link: '🔗',
  list: '☰',
  lock: '🔒',
  logout: '🚪',
  message: '💬',
  pencil: '✏️',
  pen: '📝',
  pin: '📌',
  plus: '➕',
  quote: '❝',
  reply: '↩️',
  rss: '📡',
  search: '🔍',
  settings: '⚙️',
  shield: '🛡️',
  star: '⭐',
  thumbsUp: '👍',
  trash: '🗑️',
  user: '👤',
  x: '❌',
};

export function Icon({
  name,
  width = 18,
  height = 18,
  ...props
}: { name: IconName; width?: number; height?: number } & HTMLAttributes<HTMLElement>) {
  // 双渲染：默认显示 SVG；html[data-icon-style='emoji'] 时由 CSS 切换到 emoji，
  // 因此 Icon 可继续在服务端组件中使用（无需 context）。
  return (
    <span className="icon" style={{ fontSize: Math.max(width, height) }} {...props}>
      <svg
        className="icon-svg"
        viewBox="0 0 24 24"
        width={width}
        height={height}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {PATHS[name]}
      </svg>
      <span className="icon-emoji" aria-hidden="true">
        {EMOJI[name]}
      </span>
    </span>
  );
}

/** Blocky grass-cube mark used as the community logo. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="logo-mark">
      <path d="M16 2 29 9.5v13L16 30 3 22.5v-13Z" fill="#0f7a55" />
      <path d="M16 2 29 9.5 16 17 3 9.5Z" fill="#6fce9f" />
      <path d="M3 9.5 16 17v13L3 22.5Z" fill="#2b9e70" />
      <path d="M29 9.5 16 17v13l13-7.5Z" fill="#127a55" />
      <path d="m8.5 12.1 4.2 2.4-4.2 2.4-4.2-2.4Z" fill="#b7ead0" opacity=".7" />
      <path d="m16 9.5 4.4 2.5-4.4 2.5-4.4-2.5Z" fill="#8fdcb8" opacity=".45" />
    </svg>
  );
}
