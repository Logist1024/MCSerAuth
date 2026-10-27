'use client';

import type {
  ConsoleSessionResponse,
  ConsoleStaffMember,
  SiteSettings,
  UserRole,
} from '@mcserauth/shared';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  consoleGetSettings,
  consoleListStaff,
  consoleLogin,
  consoleLogout,
  consoleSearchUsers,
  consoleUpdateSettings,
  consoleUpdateUserRole,
  fetchConsoleSession,
} from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { roleClass, roleLabel } from '@/lib/forum-ui';

const ROLE_OPTIONS: UserRole[] = ['user', 'reviewer', 'admin', 'superadmin'];
type Tab = 'site' | 'staff';

/**
 * Root console: separate key-based login (no website account required).
 * The page lives on an unlinked path and is protected by CONSOLE_KEY.
 */
export default function ConsoleClient() {
  const [session, setSession] = useState<ConsoleSessionResponse | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('site');

  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [staff, setStaff] = useState<ConsoleStaffMember[] | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<ConsoleStaffMember[] | null>(null);

  const [siteName, setSiteName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [footerText, setFooterText] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [mailProvider, setMailProvider] = useState<SiteSettings['mailProvider']>('console');
  const [mailFrom, setMailFrom] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [clearSmtpPass, setClearSmtpPass] = useState(false);

  const applySettings = useCallback((current: SiteSettings) => {
    setSettings(current);
    setSiteName(current.siteName);
    setTagline(current.tagline);
    setDescription(current.description);
    setFooterText(current.footerText);
    setAnnouncement(current.announcement ?? '');
    setContactEmail(current.contactEmail ?? '');
    setMailProvider(current.mailProvider);
    setMailFrom(current.mailFrom);
    setSmtpHost(current.smtpHost ?? '');
    setSmtpPort(current.smtpPort);
    setSmtpUser(current.smtpUser ?? '');
    setSmtpPass('');
    setClearSmtpPass(false);
  }, []);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [currentSettings, currentStaff] = await Promise.all([
        consoleGetSettings(),
        consoleListStaff(),
      ]);
      applySettings(currentSettings);
      setStaff(currentStaff);
    } catch (loadError) {
      setError(describeApiError(loadError));
      setSession((current) =>
        current === null ? current : { ...current, authenticated: false, expiresAt: null },
      );
    }
  }, [applySettings]);

  const refreshSession = useCallback(async () => {
    try {
      const current = await fetchConsoleSession();
      setSession(current);
      if (current.authenticated) {
        await loadData();
      }
    } catch (sessionError) {
      setError(describeApiError(sessionError));
      setSession({ enabled: true, authenticated: false, expiresAt: null });
    }
  }, [loadData]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  async function login(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await consoleLogin(key);
      setKey('');
      setNotice('已登录超级后台。');
      await refreshSession();
    } catch (loginError) {
      setError(describeApiError(loginError));
    } finally {
      setBusy(false);
    }
  }

  async function logout(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await consoleLogout();
      setSession({ enabled: true, authenticated: false, expiresAt: null });
      setSettings(null);
      setStaff(null);
      setNotice('已退出超级后台。');
    } catch (logoutError) {
      setError(describeApiError(logoutError));
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await consoleUpdateSettings({
        siteName: siteName.trim(),
        tagline: tagline.trim(),
        description: description.trim(),
        footerText: footerText.trim(),
        announcement: announcement.trim() === '' ? null : announcement.trim(),
        contactEmail: contactEmail.trim() === '' ? null : contactEmail.trim(),
        mailProvider,
        mailFrom: mailFrom.trim(),
        smtpHost: smtpHost.trim() === '' ? null : smtpHost.trim(),
        smtpPort,
        smtpUser: smtpUser.trim() === '' ? null : smtpUser.trim(),
        ...(clearSmtpPass
          ? { smtpPass: null }
          : smtpPass.trim() === ''
            ? {}
            : { smtpPass: smtpPass.trim() }),
      });
      applySettings(updated);
      setNotice('全站配置已保存。');
    } catch (saveError) {
      setError(describeApiError(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: ConsoleStaffMember, role: UserRole): Promise<void> {
    if (role === member.role) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await consoleUpdateUserRole(member.id, { role });
      setNotice(`${member.name} 的角色已调整为${roleLabel(updated.role)}。`);
      setStaff(await consoleListStaff());
      setUserResults((current) =>
        current === null
          ? current
          : current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (roleError) {
      setError(describeApiError(roleError));
    } finally {
      setBusy(false);
    }
  }

  async function searchUsers(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setUserResults(await consoleSearchUsers(userQuery));
    } catch (searchError) {
      setError(describeApiError(searchError));
    } finally {
      setBusy(false);
    }
  }

  function roleSelect(member: ConsoleStaffMember): ReactNode {
    return (
      <label className="inline-select">
        <span className="sr-only">{member.name} 的角色</span>
        <select
          value={member.role}
          disabled={busy}
          onChange={(event) => void changeRole(member, event.target.value as UserRole)}
        >
          {ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {roleLabel(role)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (session === null) {
    return (
      <section className="card">
        <h1>超级后台</h1>
        <p className="muted">正在检查控制台状态…</p>
      </section>
    );
  }

  if (!session.enabled) {
    return (
      <section className="card">
        <h1>超级后台</h1>
        <p className="bad">控制台未启用。</p>
        <p className="muted">
          请在服务端环境变量中配置 <code>CONSOLE_KEY</code>（至少 16 个字符）后重启服务。
        </p>
      </section>
    );
  }

  if (!session.authenticated) {
    return (
      <div className="console-layout">
        <section className="card console-login">
          <p className="page-eyebrow">Root console</p>
          <h1>超级后台</h1>
          <p className="muted">
            使用服务器配置的控制台密钥登录。此入口不需要网站账号，也不会出现在站点导航中。
          </p>
          <form className="stack" onSubmit={login}>
            <div className="field">
              <label htmlFor="console-key">控制台密钥</label>
              <input
                id="console-key"
                type="password"
                value={key}
                autoComplete="current-password"
                required
                onChange={(event) => setKey(event.target.value)}
              />
            </div>
            {notice !== null ? <p className="ok">{notice}</p> : null}
            {error !== null ? <p className="bad">{error}</p> : null}
            <div className="actions">
              <button className="button primary" type="submit" disabled={busy}>
                {busy ? '验证中…' : '进入超级后台'}
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="page-eyebrow">Root console</p>
            <h1>超级后台</h1>
          </div>
          <div className="actions">
            <span className="muted small">
              会话到期：{session.expiresAt ? formatDateTime(session.expiresAt) : '未知'}
            </span>
            <button className="button ghost small" type="button" onClick={() => void logout()}>
              退出
            </button>
          </div>
        </div>
        <p className="muted small">
          这里拥有最高权限：可配置站点与发件邮箱，并可调整包括超级管理员在内的所有角色。
        </p>
        <div className="tabs" role="tablist" aria-label="超级后台分区">
          <button
            className={`tab${tab === 'site' ? ' active' : ''}`}
            type="button"
            role="tab"
            aria-selected={tab === 'site'}
            onClick={() => setTab('site')}
          >
            站点与发件
          </button>
          <button
            className={`tab${tab === 'staff' ? ' active' : ''}`}
            type="button"
            role="tab"
            aria-selected={tab === 'staff'}
            onClick={() => setTab('staff')}
          >
            角色管理
          </button>
        </div>
      </section>

      {notice !== null ? <p className="ok">{notice}</p> : null}
      {error !== null ? <p className="bad">{error}</p> : null}

      {tab === 'site' ? (
        settings === null ? (
          <section className="card">
            <p className="muted">加载配置中…</p>
          </section>
        ) : (
          <section className="card">
            <h2>站点与发件配置</h2>
            <form className="stack" onSubmit={saveSettings}>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="console-site-name">站点名称</label>
                  <input
                    id="console-site-name"
                    value={siteName}
                    maxLength={40}
                    required
                    onChange={(event) => setSiteName(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="console-tagline">副标题</label>
                  <input
                    id="console-tagline"
                    value={tagline}
                    maxLength={80}
                    required
                    onChange={(event) => setTagline(event.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="console-description">站点描述</label>
                <textarea
                  id="console-description"
                  value={description}
                  maxLength={200}
                  rows={2}
                  required
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="console-footer">页脚文案</label>
                  <input
                    id="console-footer"
                    value={footerText}
                    maxLength={200}
                    required
                    onChange={(event) => setFooterText(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="console-contact">联系邮箱</label>
                  <input
                    id="console-contact"
                    type="email"
                    value={contactEmail}
                    maxLength={254}
                    onChange={(event) => setContactEmail(event.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="console-announcement">全站公告（留空隐藏）</label>
                <textarea
                  id="console-announcement"
                  value={announcement}
                  maxLength={300}
                  rows={2}
                  onChange={(event) => setAnnouncement(event.target.value)}
                />
              </div>

              <h3>发件设置</h3>
              <p className="muted small">
                配置会持久化保存；当前版本尚未接入实际邮件投递，接入后按这里的发件方式与账号发送。
              </p>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="console-mail-provider">发件方式</label>
                  <select
                    id="console-mail-provider"
                    value={mailProvider}
                    onChange={(event) =>
                      setMailProvider(event.target.value as SiteSettings['mailProvider'])
                    }
                  >
                    <option value="console">console（开发输出）</option>
                    <option value="smtp">SMTP</option>
                    <option value="resend">Resend</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="console-mail-from">发件邮箱</label>
                  <input
                    id="console-mail-from"
                    type="email"
                    value={mailFrom}
                    maxLength={254}
                    required
                    onChange={(event) => setMailFrom(event.target.value)}
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="console-smtp-host">SMTP 主机</label>
                  <input
                    id="console-smtp-host"
                    value={smtpHost}
                    maxLength={255}
                    placeholder="smtp.example.com"
                    onChange={(event) => setSmtpHost(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="console-smtp-port">SMTP 端口</label>
                  <input
                    id="console-smtp-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={smtpPort}
                    onChange={(event) => setSmtpPort(Number(event.target.value))}
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="console-smtp-user">SMTP 用户名</label>
                  <input
                    id="console-smtp-user"
                    value={smtpUser}
                    maxLength={255}
                    onChange={(event) => setSmtpUser(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="console-smtp-pass">SMTP 密码</label>
                  <input
                    id="console-smtp-pass"
                    type="password"
                    value={smtpPass}
                    maxLength={512}
                    autoComplete="new-password"
                    placeholder={settings.smtpPassSet ? '已保存，留空保持不变' : '未设置'}
                    onChange={(event) => {
                      setSmtpPass(event.target.value);
                      setClearSmtpPass(false);
                    }}
                  />
                  {settings.smtpPassSet ? (
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={clearSmtpPass}
                        onChange={(event) => {
                          setClearSmtpPass(event.target.checked);
                          if (event.target.checked) {
                            setSmtpPass('');
                          }
                        }}
                      />
                      清除已保存的 SMTP 密码
                    </label>
                  ) : null}
                  <span className="field-hint">密码使用服务端密钥加密后存储，不会回显。</span>
                </div>
              </div>

              <div className="actions">
                <button className="button primary" type="submit" disabled={busy}>
                  {busy ? '保存中…' : '保存全部配置'}
                </button>
              </div>
            </form>
          </section>
        )
      ) : null}

      {tab === 'staff' ? (
        <section className="card">
          <h2>角色管理</h2>
          <p className="muted small">
            超级管理员可在本站点调整所有角色；站点内超级管理员只能管理审核员与管理员。
          </p>
          {staff === null ? <p className="muted">加载中…</p> : null}
          {staff !== null && staff.length === 0 ? (
            <p className="texture-empty">还没有任何审核员或管理员。</p>
          ) : null}
          {staff !== null && staff.length > 0 ? (
            <ul className="admin-list">
              {staff.map((member) => (
                <li className="admin-list-item" key={member.id}>
                  <div>
                    <strong>{member.name}</strong>
                    <span className={`role-badge ${roleClass(member.role)}`}>
                      {roleLabel(member.role)}
                    </span>
                    <p className="muted small">
                      {member.email} · 加入于 {formatDate(member.createdAt)}
                    </p>
                  </div>
                  {roleSelect(member)}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="console-user-search">
            <h3>查找账号并提升角色</h3>
            <form className="inline-form" onSubmit={searchUsers}>
              <input
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder="昵称或邮箱"
                maxLength={100}
              />
              <button className="button secondary" type="submit" disabled={busy}>
                搜索
              </button>
            </form>
            {userResults !== null && userResults.length === 0 ? (
              <p className="texture-empty">没有匹配的账号。</p>
            ) : null}
            {userResults !== null && userResults.length > 0 ? (
              <ul className="admin-list">
                {userResults.map((member) => (
                  <li className="admin-list-item" key={member.id}>
                    <div>
                      <strong>{member.name}</strong>
                      <span className={`role-badge ${roleClass(member.role)}`}>
                        {roleLabel(member.role)}
                      </span>
                      <p className="muted small">
                        {member.email} · 注册于 {formatDate(member.createdAt)}
                      </p>
                    </div>
                    {roleSelect(member)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
