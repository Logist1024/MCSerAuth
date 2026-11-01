/**
 * 外观偏好（主题模式 / 主题色 / 图标风格）。
 *
 * 偏好只存浏览器 localStorage，服务端不感知；`app/layout.tsx` 里的内联脚本
 * 在首帧前把偏好写到 `<html>` 的 data 属性上，`globals.css` 按属性切变量，
 * 因此本模块的所有读写都是纯浏览器侧逻辑。
 */

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const THEME_COLORS = ['green', 'blue', 'purple', 'orange', 'pink'] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];

export const ICON_STYLES = ['svg', 'emoji'] as const;
export type IconStyle = (typeof ICON_STYLES)[number];

export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const DEFAULT_THEME_COLOR: ThemeColor = 'green';
export const DEFAULT_ICON_STYLE: IconStyle = 'svg';

export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
};

export const THEME_COLOR_LABELS: Record<ThemeColor, string> = {
  green: '翠绿',
  blue: '天蓝',
  purple: '黛紫',
  orange: '暖橙',
  pink: '樱粉',
};

export const ICON_STYLE_LABELS: Record<IconStyle, string> = {
  svg: '线条图标',
  emoji: 'Emoji 图标',
};

const KEY_MODE = 'mcserauth:mode';
const KEY_COLOR = 'mcserauth:color';
const KEY_ICONS = 'mcserauth:icons';

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
}

export function loadThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_MODE;
  }
  return pick(window.localStorage.getItem(KEY_MODE), THEME_MODES, DEFAULT_THEME_MODE);
}

export function loadThemeColor(): ThemeColor {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_COLOR;
  }
  return pick(window.localStorage.getItem(KEY_COLOR), THEME_COLORS, DEFAULT_THEME_COLOR);
}

export function loadIconStyle(): IconStyle {
  if (typeof window === 'undefined') {
    return DEFAULT_ICON_STYLE;
  }
  return pick(window.localStorage.getItem(KEY_ICONS), ICON_STYLES, DEFAULT_ICON_STYLE);
}

export function saveThemeMode(mode: ThemeMode): void {
  window.localStorage.setItem(KEY_MODE, mode);
}

export function saveThemeColor(color: ThemeColor): void {
  window.localStorage.setItem(KEY_COLOR, color);
}

export function saveIconStyle(style: IconStyle): void {
  window.localStorage.setItem(KEY_ICONS, style);
}

/** 把当前偏好写到 `<html>` 的 data 属性上，CSS 变量随属性即时切换。 */
export function applyAppearance(mode: ThemeMode, color: ThemeColor, icons: IconStyle): void {
  const root = document.documentElement;
  root.dataset.themeMode = mode;
  root.dataset.themeColor = color;
  root.dataset.iconStyle = icons;
}

/**
 * 首帧前同步执行的初始化脚本（内联在 body 顶部）。
 * 与 `lib/appearance.ts` 的取值规则保持一致；不能用模块导入，因为必须是阻塞式纯脚本。
 */
export const APPEARANCE_INIT_SCRIPT = `(function(){try{var d=document.documentElement;var g=function(k){try{return window.localStorage.getItem(k)}catch(e){return null}};var m=g('${KEY_MODE}');var c=g('${KEY_COLOR}');var i=g('${KEY_ICONS}');if(m!=='light'&&m!=='dark'&&m!=='system'){m='${DEFAULT_THEME_MODE}'}if(['green','blue','purple','orange','pink'].indexOf(c)<0){c='${DEFAULT_THEME_COLOR}'}if(i!=='emoji'){i='${DEFAULT_ICON_STYLE}'}d.dataset.themeMode=m;d.dataset.themeColor=c;d.dataset.iconStyle=i;}catch(e){}})();`;
