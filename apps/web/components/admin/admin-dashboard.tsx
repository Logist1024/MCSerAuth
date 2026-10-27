'use client';

import {
  hasAdminPermission,
  roleAtLeast,
  type AdminPermission,
  type UserRole,
} from '@mcserauth/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminAnnouncements from './admin-announcements';
import AdminCategories from './admin-categories';
import AdminCaptcha from './admin-captcha';
import AdminGrowth from './admin-growth';
import AdminHome from './admin-home';
import AdminOverview from './admin-overview';
import AdminPermissionsPanel from './admin-permissions';
import AdminReports from './admin-reports';
import AdminRules from './admin-rules';
import AdminServers from './admin-servers';
import AdminSite from './admin-site';
import AdminTextures from './admin-textures';
import AdminUsers from './admin-users';
import { roleLabel } from '@/lib/forum-ui';

interface TabSpec {
  key: string;
  label: string;
  /** Minimum role required to see the tab at all. */
  min: UserRole;
  /** Single delegated capability needed (superadmins hold every capability). */
  capability?: AdminPermission;
  /** Any one of these delegated capabilities is enough. */
  anyOf?: readonly AdminPermission[];
}

const TABS = [
  { key: 'overview', label: '概览', min: 'reviewer' },
  { key: 'reports', label: '举报', min: 'reviewer' },
  { key: 'users', label: '用户', min: 'reviewer' },
  { key: 'textures', label: '纹理', min: 'reviewer' },
  {
    key: 'growth',
    label: '成长台',
    min: 'reviewer',
    anyOf: ['titles.manage', 'banners.manage', 'points.adjust'],
  },
  { key: 'rules', label: '成长规则', min: 'reviewer', capability: 'site.manage' },
  { key: 'home', label: '首页内容', min: 'reviewer', capability: 'site.manage' },
  { key: 'captcha', label: '人机验证', min: 'reviewer', capability: 'site.manage' },
  { key: 'site', label: '站点设置', min: 'superadmin' },
  { key: 'categories', label: '版块', min: 'superadmin' },
  { key: 'announcements', label: '公告', min: 'superadmin' },
  { key: 'servers', label: '服务器白名单', min: 'superadmin' },
  { key: 'permissions', label: '权限下放', min: 'superadmin' },
] as const satisfies readonly TabSpec[];

type TabKey = (typeof TABS)[number]['key'];

function isAllowed(
  role: UserRole,
  permissions: readonly AdminPermission[],
  item: TabSpec,
): boolean {
  if (!roleAtLeast(role, item.min)) {
    return false;
  }
  if (item.capability !== undefined && !hasAdminPermission(role, permissions, item.capability)) {
    return false;
  }
  if (
    item.anyOf !== undefined &&
    !item.anyOf.some((capability) => hasAdminPermission(role, permissions, capability))
  ) {
    return false;
  }
  return true;
}

function isTabKey(value: string | null): value is TabKey {
  return value !== null && TABS.some((item) => item.key === value);
}

export default function AdminDashboard({
  role,
  userName,
  viewerId,
  permissions,
}: {
  role: UserRole;
  userName: string;
  viewerId: string;
  permissions: readonly AdminPermission[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get('tab');
  const visibleTabs = TABS.filter((item) => isAllowed(role, permissions, item));
  const tab =
    isTabKey(requested) && visibleTabs.some((item) => item.key === requested)
      ? requested
      : (visibleTabs[0]?.key ?? 'overview');

  function selectTab(next: TabKey): void {
    router.replace(`/admin?tab=${next}`, { scroll: false });
  }

  return (
    <>
      <section className="card">
        <div className="section-heading">
          <h1>管理后台</h1>
          <span className="muted small">
            {userName} · {roleLabel(role)}
          </span>
        </div>
        <div className="tabs" role="tablist" aria-label="管理后台分区">
          {visibleTabs.map((item) => (
            <button
              key={item.key}
              className={`tab${tab === item.key ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => selectTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {tab === 'overview' ? <AdminOverview /> : null}
      {tab === 'reports' ? <AdminReports /> : null}
      {tab === 'users' ? <AdminUsers role={role} viewerId={viewerId} /> : null}
      {tab === 'textures' ? <AdminTextures /> : null}
      {tab === 'growth' ? <AdminGrowth role={role} permissions={permissions} /> : null}
      {tab === 'rules' ? <AdminRules /> : null}
      {tab === 'home' ? <AdminHome /> : null}
      {tab === 'captcha' ? <AdminCaptcha /> : null}
      {tab === 'site' ? <AdminSite /> : null}
      {tab === 'categories' ? <AdminCategories /> : null}
      {tab === 'announcements' ? <AdminAnnouncements /> : null}
      {tab === 'servers' ? <AdminServers /> : null}
      {tab === 'permissions' ? <AdminPermissionsPanel /> : null}
    </>
  );
}
