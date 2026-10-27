import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoginForm from '@/components/login-form';
import { Icon } from '@/components/icons';

export const metadata: Metadata = { title: '登录 / 注册' };

export default function LoginPage() {
  return (
    <div className="auth-layout">
      <section className="auth-intro">
        <h1>社区账号</h1>
        <p>一个账号，论坛与游戏通用。</p>
        <ul className="auth-points">
          <li>
            <Icon name="check" width={16} height={16} />
            论坛与启动器共用账号
          </li>
          <li>
            <Icon name="check" width={16} height={16} />
            皮肤与披风自动同步
          </li>
        </ul>
      </section>

      <Suspense
        fallback={
          <div className="auth-card">
            <h2>加载中…</h2>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
