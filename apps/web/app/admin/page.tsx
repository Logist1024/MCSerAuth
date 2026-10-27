import { roleAtLeast, type UserSettingsResponse } from '@mcserauth/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import AdminDashboard from '@/components/admin/admin-dashboard';
import { roleLabel } from '@/lib/forum-ui';
import { serverApiFetchResult } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '管理后台' };

export default async function AdminPage() {
  const result = await serverApiFetchResult<UserSettingsResponse>('/api/user/settings');

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      redirect('/login?next=%2Fadmin');
    }
    return (
      <section className="card">
        <h1>管理后台</h1>
        <p className="bad">暂时无法验证管理权限，请稍后重试。</p>
        <Link className="button ghost" href="/admin">
          重试
        </Link>
      </section>
    );
  }

  const role = result.data.user.role;
  if (result.data.user.banned) {
    return (
      <section className="card">
        <h1>管理后台</h1>
        <p className="bad">该账号已被封禁，无法访问管理功能。</p>
        <Link className="button secondary" href="/forum">
          返回论坛
        </Link>
      </section>
    );
  }
  if (!roleAtLeast(role, 'reviewer')) {
    return (
      <section className="card">
        <h1>管理后台</h1>
        <p className="bad">需要审核员、管理员或超级管理员权限（当前：{roleLabel(role)}）。</p>
        <Link className="button secondary" href="/forum">
          返回论坛
        </Link>
      </section>
    );
  }

  return (
    <Suspense
      fallback={
        <section className="card">
          <h1>管理后台</h1>
          <p className="muted">加载中…</p>
        </section>
      }
    >
      <AdminDashboard
        role={role}
        userName={result.data.user.name}
        viewerId={result.data.user.id}
        permissions={result.data.user.permissions}
      />
    </Suspense>
  );
}
