'use client';

import { CAPTCHA_PROVIDERS, type CaptchaProvider, type CaptchaSettings } from '@mcserauth/shared';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { adminCaptchaSettings, adminUpdateCaptchaSettings } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import './admin-growth.css';

const PROVIDER_LABELS: Record<CaptchaProvider, string> = {
  builtin: '内置算术题（本站自绘 SVG，无需第三方）',
  turnstile: 'Cloudflare Turnstile（需 Site Key 与 Secret）',
  hcaptcha: 'hCaptcha（需 Site Key 与 Secret）',
};

const PROVIDER_SHORT_LABELS: Record<CaptchaProvider, string> = {
  builtin: '内置',
  turnstile: 'Turnstile',
  hcaptcha: 'hCaptcha',
};

/** Captcha toggle plus provider credentials (`site.manage`). */
export default function AdminCaptcha() {
  const toast = useToast();
  const [settings, setSettings] = useState<CaptchaSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<CaptchaProvider>('builtin');
  const [siteKey, setSiteKey] = useState('');
  const [secret, setSecret] = useState('');
  const [clearSecret, setClearSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const current = await adminCaptchaSettings();
      setSettings(current);
      setEnabled(current.enabled);
      setProvider(current.provider);
      setSiteKey(current.siteKey ?? '');
      setSecret('');
      setClearSecret(false);
    } catch (loadError) {
      setError(describeApiError(loadError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const needsExternalKeys = enabled && provider !== 'builtin';
  const hasUsableSecret = settings?.secretSet === true ? !clearSecret : secret.trim() !== '';
  const missingSecret = !hasUsableSecret;

  async function save(): Promise<void> {
    if (needsExternalKeys) {
      if (siteKey.trim() === '') {
        toast.error('启用外部人机验证时必须填写 Site Key。');
        return;
      }
      if (missingSecret) {
        toast.error('启用外部人机验证时必须填写 Secret。');
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const next = await adminUpdateCaptchaSettings({
        enabled,
        provider,
        siteKey: siteKey.trim() === '' ? null : siteKey.trim(),
        ...(clearSecret ? { secret: '' } : secret.trim() === '' ? {} : { secret: secret.trim() }),
      });
      setSettings(next);
      setEnabled(next.enabled);
      setProvider(next.provider);
      setSiteKey(next.siteKey ?? '');
      setSecret('');
      setClearSecret(false);
      toast.success(next.enabled ? '人机验证已开启。' : '人机验证已关闭。');
    } catch (saveError) {
      setError(describeApiError(saveError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="section-heading">
        <h2>人机验证</h2>
        <span className="muted small">
          当前状态：{settings === null ? '读取中' : settings.enabled ? '已开启' : '已关闭'}
          {settings !== null ? ` · ${PROVIDER_SHORT_LABELS[settings.provider]}` : ''}
        </span>
      </div>

      <div className="mg-warn">
        <strong>开启前请先读：</strong>
        <span>
          开启后，所有网页端登录、注册、找回密码，以及启动器授权页的登录都要先通过人机验证；
          已登录的会话与游戏内认证不受影响。若第三方服务不可达，玩家将无法登录，请确认 Site Key 与
          Secret 填写正确后再启用。
        </span>
      </div>

      {error !== null ? (
        <p className="bad" role="alert">
          {error}
        </p>
      ) : null}

      {settings === null ? (
        <p className="muted">加载中…</p>
      ) : (
        <div className="stack">
          <div className="mg-perm">
            <input
              id="captcha-enabled"
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <label className="mg-perm-text" htmlFor="captcha-enabled">
              <strong>启用人机验证</strong>
              <span>关闭时登录与注册表单不出现任何验证组件。</span>
            </label>
          </div>

          <fieldset className="mg-provider">
            <legend className="muted small">验证方式</legend>
            {CAPTCHA_PROVIDERS.map((item) => (
              <div className="mg-provider-option" key={item}>
                <input
                  id={`captcha-provider-${item}`}
                  name="captcha-provider"
                  type="radio"
                  checked={provider === item}
                  disabled={busy}
                  onChange={() => setProvider(item)}
                />
                <label className="mg-perm-text" htmlFor={`captcha-provider-${item}`}>
                  <strong>{PROVIDER_SHORT_LABELS[item]}</strong>
                  <span>{PROVIDER_LABELS[item]}</span>
                </label>
              </div>
            ))}
          </fieldset>

          <div className="mg-grid-2">
            <div className="field">
              <label htmlFor="captcha-site-key">Site Key（公开，写入前端页面）</label>
              <input
                id="captcha-site-key"
                value={siteKey}
                maxLength={128}
                placeholder={provider === 'builtin' ? '内置方式不需要' : '例如 0x4AAA...'}
                disabled={busy || provider === 'builtin'}
                onChange={(event) => setSiteKey(event.target.value)}
              />
              <p className="field-hint">
                {provider === 'builtin'
                  ? '内置算术题由服务端绘制 SVG，不需要第三方密钥。'
                  : '第三方控制台里给 Public / Site key 的那一串。'}
              </p>
            </div>
            <div className="field">
              <label htmlFor="captcha-secret">Secret（保密，保存后不再回显）</label>
              <input
                id="captcha-secret"
                type="password"
                value={secret}
                maxLength={256}
                autoComplete="new-password"
                placeholder={settings.secretSet ? '已设置，留空保持不变' : '尚未设置'}
                disabled={busy}
                onChange={(event) => setSecret(event.target.value)}
              />
              <p className="field-hint">
                {settings.secretSet
                  ? '留空表示保持不变；填写则覆盖已保存的密钥。'
                  : '第三方控制台里给 Private / Secret key 的那一串。'}
              </p>
              {settings.secretSet ? (
                <label className="checkbox-row" htmlFor="captcha-clear-secret">
                  <input
                    id="captcha-clear-secret"
                    type="checkbox"
                    checked={clearSecret}
                    disabled={busy}
                    onChange={(event) => setClearSecret(event.target.checked)}
                  />
                  清除已保存的 Secret
                </label>
              ) : null}
            </div>
          </div>

          <div className="actions">
            <button
              className="button"
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void save()}
            >
              {busy ? '保存中…' : '保存人机验证配置'}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => void load()}
            >
              重新读取
            </button>
            {enabled && provider !== 'builtin' && missingSecret ? (
              <span className="muted small">启用第三方验证还需填写 Secret。</span>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
