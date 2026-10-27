import type { ForumCategory, ForumPostDetail, UserSettingsResponse } from '@mcserauth/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Breadcrumbs from '@/components/breadcrumbs';
import { Icon } from '@/components/icons';
import PostEditor from '@/components/post-editor';
import { serverApiFetch } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: '编辑帖子 · 论坛' };

export default async function EditPostPage({ params }: PageProps) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) {
    notFound();
  }

  const [post, categories, settings] = await Promise.all([
    serverApiFetch<ForumPostDetail>(`/api/forum/posts/${postId}`),
    serverApiFetch<ForumCategory[]>('/api/forum/categories'),
    serverApiFetch<UserSettingsResponse>('/api/user/settings'),
  ]);

  if (post === null || settings === null || post.author.id !== settings.user.id) {
    notFound();
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: '首页', href: '/' },
          { label: '论坛', href: '/forum' },
          { label: post.category.name, href: `/forum/${post.category.slug}` },
          { label: post.title, href: `/forum/post/${post.id}`, title: post.title },
          { label: '编辑' },
        ]}
      />

      <header className="page-head">
        <div>
          <h1>编辑帖子</h1>
          <p className="page-description">保存后帖子页会立即更新。</p>
        </div>
      </header>

      {categories === null ? (
        <section className="panel">
          <div className="empty-state">
            <span className="empty-state-icon">
              <Icon name="alert" width={22} height={22} />
            </span>
            <p>版块数据加载失败，请稍后重试。</p>
          </div>
        </section>
      ) : (
        <PostEditor categories={categories} post={post} cancelHref={`/forum/post/${post.id}`} />
      )}
    </>
  );
}
