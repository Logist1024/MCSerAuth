'use client';

import { useState } from 'react';
import { API_BASE_URL } from '@/lib/api-client';

/** Normalize the configured API root into the authlib-injector server address. */
const AUTH_SERVER_URL = `${API_BASE_URL.replace(/\/+$/, '')}/api`;

/** Short, copyable instructions for connecting a launcher through authlib-injector. */
export default function LauncherGuide() {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copyAddress(): Promise<void> {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(AUTH_SERVER_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <section className="card launcher-guide">
      <div className="section-heading">
        <h2>连接启动器</h2>
        <span className="muted small">外置登录</span>
      </div>

      <p className="muted small">
        在启动器中添加外置登录账号，使用本站邮箱和密码登录；首次登录会自动创建游戏角色。
      </p>

      <div className="launcher-address">
        <span className="launcher-address-label">认证服务器</span>
        <code>{AUTH_SERVER_URL}</code>
        <button className="button tiny secondary" type="button" onClick={() => void copyAddress()}>
          {copied ? '已复制' : '复制地址'}
        </button>
      </div>
      {failed ? (
        <p className="bad small" role="alert">
          复制失败，请手动选中上方地址复制。
        </p>
      ) : null}

      <ol className="launcher-steps">
        <li>打开启动器账户设置，选择「外置登录」或「Authlib-Injector」。</li>
        <li>认证服务器填写上方地址。</li>
        <li>用户名填本站邮箱，密码填本站密码。</li>
        <li>登录后即可启动游戏，皮肤与披风会自动同步。</li>
      </ol>

      <div className="launcher-clients">
        <div className="launcher-client">
          <strong>HMCL</strong>
          <span>设置 → 账户 → 添加账户 → 外置登录</span>
        </div>
        <div className="launcher-client">
          <strong>PCL2</strong>
          <span>设置 → 启动器 → 游戏账户 → 认证服务器</span>
        </div>
        <div className="launcher-client">
          <strong>Prism Launcher</strong>
          <span>账户 → 添加账户 → Authlib-Injector</span>
        </div>
      </div>

      <p className="muted small">
        进服还需要客户端和服务端注入 authlib-injector；PCL2 默认只接受 HTTPS 地址。
      </p>
    </section>
  );
}
