'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import {
  ICON_STYLES,
  ICON_STYLE_LABELS,
  THEME_COLORS,
  THEME_COLOR_LABELS,
  THEME_MODES,
  THEME_MODE_LABELS,
  applyAppearance,
  loadIconStyle,
  loadThemeColor,
  loadThemeMode,
  saveIconStyle,
  saveThemeColor,
  saveThemeMode,
  type IconStyle,
  type ThemeColor,
  type ThemeMode,
} from '@/lib/appearance';

/**
 * 页头外观弹层：主题模式（浅色/深色/跟随系统）、点缀色预设、图标风格。
 * 偏好存 localStorage 并即时写到 <html> 的 data 属性上（见 lib/appearance.ts）。
 */
export default function AppearanceMenu() {
  const [mode, setMode] = useState<ThemeMode>('system');
  const [color, setColor] = useState<ThemeColor>('green');
  const [icons, setIcons] = useState<IconStyle>('svg');
  const [mounted, setMounted] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    setMode(loadThemeMode());
    setColor(loadThemeColor());
    setIcons(loadIconStyle());
    setMounted(true);
  }, []);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent): void => {
      const element = menu.current;
      if (
        element !== null &&
        element.open &&
        event.target instanceof Node &&
        !element.contains(event.target)
      ) {
        element.open = false;
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      const element = menu.current;
      if (event.key !== 'Escape' || element === null || !element.open) {
        return;
      }
      element.open = false;
      element.querySelector<HTMLElement>('summary')?.focus();
    };
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  function update(next: { mode?: ThemeMode; color?: ThemeColor; icons?: IconStyle }): void {
    const nextMode = next.mode ?? mode;
    const nextColor = next.color ?? color;
    const nextIcons = next.icons ?? icons;
    setMode(nextMode);
    setColor(nextColor);
    setIcons(nextIcons);
    saveThemeMode(nextMode);
    saveThemeColor(nextColor);
    saveIconStyle(nextIcons);
    applyAppearance(nextMode, nextColor, nextIcons);
  }

  return (
    <details className="appearance-menu" ref={menu}>
      <summary
        className="icon-button appearance-menu-trigger"
        aria-label="外观设置"
        title="外观设置"
      >
        <Icon name="settings" width={19} height={19} />
      </summary>
      <div className="appearance-menu-popover" onClick={(event) => event.stopPropagation()}>
        <p className="appearance-menu-title">外观</p>

        <div className="appearance-section">
          <span className="appearance-label">主题模式</span>
          <div className="appearance-segment" role="group" aria-label="主题模式">
            {THEME_MODES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={mounted && mode === item}
                onClick={() => update({ mode: item })}
              >
                {THEME_MODE_LABELS[item]}
              </button>
            ))}
          </div>
        </div>

        <div className="appearance-section">
          <span className="appearance-label">点缀色</span>
          <div className="appearance-colors" role="group" aria-label="点缀色">
            {THEME_COLORS.map((item) => (
              <button
                key={item}
                type="button"
                className="appearance-color-dot"
                data-color={item}
                data-active={mounted && color === item}
                aria-label={THEME_COLOR_LABELS[item]}
                aria-pressed={mounted && color === item}
                title={THEME_COLOR_LABELS[item]}
                onClick={() => update({ color: item })}
              />
            ))}
          </div>
        </div>

        <div className="appearance-section">
          <span className="appearance-label">图标风格</span>
          <div className="appearance-segment" role="group" aria-label="图标风格">
            {ICON_STYLES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={mounted && icons === item}
                onClick={() => update({ icons: item })}
              >
                {ICON_STYLE_LABELS[item]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
