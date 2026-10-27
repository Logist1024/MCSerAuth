'use client';

import { SITE_CUSTOM_CSS_MAX_LENGTH, type SiteDisplaySettings } from '@mcserauth/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  adminGetSiteSettings,
  adminRemoveSiteIcon,
  adminUpdateSiteSettings,
  adminUploadSiteIcon,
} from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { LogoMark } from '@/components/icons';
import TextureUploadForm from '@/components/textures/texture-upload-form';

const ICON_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/** Superadmin editor for the public site chrome (name, banner, footer, icon, CSS). */
export default function AdminSite() {
  const [settings, setSettings] = useState<SiteDisplaySettings | null>(null);
  const [siteName, setSiteName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [footerText, setFooterText] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [customCss, setCustomCss] = useState('');
  const [busy, setBusy] = useState(false);
  const [iconBusy, setIconBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const current = await adminGetSiteSettings();
      setSettings(current);
      setSiteName(current.siteName);
      setTagline(current.tagline);
      setDescription(current.description);
      setFooterText(current.footerText);
      setAnnouncement(current.announcement ?? '');
      setContactEmail(current.contactEmail ?? '');
      setCustomCss(current.customCss ?? '');
    } catch (loadError) {
      setError(describeApiError(loadError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await adminUpdateSiteSettings({
        siteName: siteName.trim(),
        tagline: tagline.trim(),
        description: description.trim(),
        footerText: footerText.trim(),
        announcement: announcement.trim() === '' ? null : announcement.trim(),
        contactEmail: contactEmail.trim() === '' ? null : contactEmail.trim(),
        customCss: customCss.trim() === '' ? null : customCss.trim(),
      });
      setSettings(updated);
      setNotice('站点展示信息已更新，约 15 秒内同步到全站页面。');
    } catch (saveError) {
      setError(describeApiError(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function submitIcon(file: File): Promise<boolean> {
    setIconBusy(true);
    setError(null);
    setNotice(null);
    try {
      setSettings(await adminUploadSiteIcon(file));
      setNotice('站点图标已更新，页头与浏览器标签页会改用新图片。');
      return true;
    } catch (iconError) {
      setError(describeApiError(iconError));
      return false;
    } finally {
      setIconBusy(false);
    }
  }

  async function removeIcon(): Promise<void> {
    setIconBusy(true);
    setError(null);
    setNotice(null);
    try {
      setSettings(await adminRemoveSiteIcon());
      setNotice('已恢复内置站点标志。');
    } catch (iconError) {
      setError(describeApiError(iconError));
    } finally {
      setIconBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <div className="section-heading">
          <h2>站点展示设置</h2>
          <span className="muted small">仅超级管理员可修改</span>
        </div>
        <p className="muted">
          这里控制站名、首页文案、全站公告、页脚与自定义
          CSS。发件邮箱等基础设施配置请前往密钥保护的超级后台。
        </p>

        {settings === null ? <p className="muted">加载中…</p> : null}
        {notice !== null ? <p className="ok">{notice}</p> : null}
        {error !== null ? <p className="bad">{error}</p> : null}

        {settings !== null ? (
          <form className="stack" onSubmit={save}>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="site-name">站点名称</label>
                <input
                  id="site-name"
                  value={siteName}
                  maxLength={40}
                  required
                  onChange={(event) => setSiteName(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="site-tagline">副标题</label>
                <input
                  id="site-tagline"
                  value={tagline}
                  maxLength={80}
                  required
                  onChange={(event) => setTagline(event.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="site-description">站点描述（首页与搜索引擎）</label>
              <textarea
                id="site-description"
                value={description}
                maxLength={200}
                rows={3}
                required
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="site-footer">页脚文案</label>
              <input
                id="site-footer"
                value={footerText}
                maxLength={200}
                required
                onChange={(event) => setFooterText(event.target.value)}
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="site-announcement">全站公告（留空隐藏）</label>
                <textarea
                  id="site-announcement"
                  value={announcement}
                  maxLength={300}
                  rows={2}
                  onChange={(event) => setAnnouncement(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="site-contact">联系邮箱（留空隐藏）</label>
                <input
                  id="site-contact"
                  type="email"
                  value={contactEmail}
                  maxLength={254}
                  onChange={(event) => setContactEmail(event.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="site-css">自定义全站 CSS（留空关闭）</label>
              <textarea
                id="site-css"
                className="mono"
                value={customCss}
                maxLength={SITE_CUSTOM_CSS_MAX_LENGTH}
                rows={8}
                spellCheck={false}
                placeholder={'.site-header {\n  backdrop-filter: blur(6px);\n}'}
                onChange={(event) => setCustomCss(event.target.value)}
              />
              <span className="field-hint">
                追加在内置主题之后，可覆盖任意样式；最多 {SITE_CUSTOM_CSS_MAX_LENGTH} 个字符。
              </span>
            </div>
            <div className="actions">
              <button className="button" type="submit" disabled={busy}>
                {busy ? '保存中…' : '保存展示设置'}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="card">
        <div className="section-heading">
          <h2>站点图标</h2>
          <span className="muted small">页头品牌与浏览器标签页共用</span>
        </div>

        {settings === null ? (
          <p className="muted">加载中…</p>
        ) : (
          <div className="site-icon-editor">
            <div className="site-icon-preview">
              {settings.iconUrl === null ? (
                <LogoMark size={48} />
              ) : (
                <img src={settings.iconUrl} alt="当前站点图标" width={48} height={48} />
              )}
            </div>
            <div className="site-icon-form">
              <TextureUploadForm
                idPrefix="site-icon"
                fileLabel="图标文件"
                accept={ICON_ACCEPT}
                submitLabel="上传图标"
                busyLabel="上传中…"
                hint="PNG / JPEG / WebP / GIF，不超过 1 MiB；建议使用方形透明 PNG。"
                busy={iconBusy}
                disabled={busy}
                onSubmit={submitIcon}
              />
              {settings.iconUrl !== null ? (
                <button
                  className="button ghost small"
                  type="button"
                  disabled={iconBusy}
                  onClick={() => void removeIcon()}
                >
                  恢复内置标志
                </button>
              ) : null}
            </div>
          </div>
        )}
        <p className="muted small">
          图标文件按内容寻址，更换后地址随之改变；若标签页仍显示旧图，请强制刷新页面。
        </p>
      </section>
    </>
  );
}
