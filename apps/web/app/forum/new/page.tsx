import type { ForumCategory, UserSettingsResponse } from '@mcserauth/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumbs from '@/components/breadcrumbs';
import PostEditor from '@/components/post-editor';
import { Icon } from '@/components/icons';
import { findCategory } from '@/lib/categories';
import { formatDateTime } from '@/lib/format';
import { serverApiFetch } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '发起新话题 · 论坛' };

interface PageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function NewPostPage({ searchParams }: PageProps) {
  const { category: categorySlug } = await searchParams;
  const [categories, settings] = await Promise.all([
    serverApiFetch<ForumCategory[]>('/api/forum/categories'),
    serverApiFetch<UserSettingsResponse>('/api/user/settings'),
  ]);

  if (settings === null) {
    return (
      <>
        <header className="page-head">
          <div>
            <h1>发起新话题</h1>
            <p className="page-description">登录后即可在社区发起讨论。</p>
          </div>
        </header>
        <section className="panel">
          <div className="empty-state">
            <span className="empty-state-icon">
              <Icon name="user" width={22} height={22} />
            </span>
            <p>发帖需要一个社区账号。登录或注册后会回到这里。</p>
            <Link className="button primary" href="/login?next=%2Fforum%2Fnew">
              登录 / 注册
            </Link>
          </div>
        </section>
      </>
    );
  }

  if (settings.user.banned) {
    return (
      <>
        <header className="page-head">
          <div>
            <h1>发起新话题</h1>
          </div>
        </header>
        <section className="panel">
          <div className="empty-state">
            <span className="empty-state-icon">
              <Icon name="alert" width={22} height={22} />
            </span>
            <p className="bad">你的账号已被论坛封禁，无法发帖。</p>
          </div>
        </section>
      </>
    );
  }

  if (
    settings.user.mutedUntil !== null &&
    new Date(settings.user.mutedUntil).getTime() > Date.now()
  ) {
    return (
      <>
        <header className="page-head">
          <div>
            <h1>发起新话题</h1>
          </div>
        </header>
        <section className="panel">
          <div className="empty-state">
            <span className="empty-state-icon">
              <Icon name="alert" width={22} height={22} />
            </span>
            <p className="bad">
              你的账号处于禁言状态，解除时间：{formatDateTime(settings.user.mutedUntil)}。
            </p>
          </div>
        </section>
      </>
    );
  }

  const initialCategory =
    categories !== null && categorySlug !== undefined
      ? findCategory(categories, categorySlug)
      : null;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: '首页', href: '/' },
          { label: '论坛', href: '/forum' },
          ...(initialCategory !== null
            ? [{ label: initialCategory.name, href: `/forum/${initialCategory.slug}` }]
            : []),
          { label: '发起新话题' },
        ]}
      />

      <header className="page-head">
        <div>
          <h1>发起新话题</h1>
          <p className="page-description">标题写清主题，正文补充上下文即可。</p>
        </div>
      </header>

      {categories === null ? (
        <section className="panel">
          <div className="empty-state">
            <span className="empty-state-icon">
              <Icon name="alert" width={22} height={22} />
            </span>
            <p>版块数据加载失败，请确认 API 服务已启动。</p>
          </div>
        </section>
      ) : (
        <PostEditor
          categories={categories}
          initialCategoryId={initialCategory?.id}
          cancelHref="/forum"
        />
      )}
    </>
  );
}
