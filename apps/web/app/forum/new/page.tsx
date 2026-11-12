import type { ForumCategory, UserSettingsResponse } from '@mcserauth/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumbs from '@/components/breadcrumbs';
import PostEditor from '@/components/post-editor';
import EmptyState from '@/components/ui/empty-state';
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
          <EmptyState
            icon="user"
            title="需要登录"
            description="发帖需要一个社区账号。登录或注册后会回到这里。"
            action={
              <Link className="button primary" href="/login?next=%2Fforum%2Fnew">
                登录 / 注册
              </Link>
            }
          />
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
          <EmptyState
            icon="alert"
            tone="error"
            title="无法发帖"
            description="你的账号已被论坛封禁，无法发帖。"
          />
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
          <EmptyState
            icon="alert"
            tone="error"
            title="账号处于禁言状态"
            description={`你的账号处于禁言状态，解除时间：${formatDateTime(settings.user.mutedUntil)}。`}
          />
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
          <EmptyState
            icon="alert"
            tone="error"
            title="版块加载失败"
            description="版块数据加载失败，请确认 API 服务已启动。"
          />
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
