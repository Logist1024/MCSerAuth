import type { ForumCategory, ForumPostSummary, Paginated } from '@mcserauth/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumbs from '@/components/breadcrumbs';
import CategoryStrip from '@/components/category-strip';
import { ForumErrorState } from '@/components/forum-skeleton';
import { Icon } from '@/components/icons';
import Pagination from '@/components/pagination';
import PostList from '@/components/post-list';
import { publicApiFetch } from '@/lib/server-api';

export const revalidate = 30;

export const metadata: Metadata = {
  title: '论坛',
  description: 'MCSerAuth 社区论坛：服务器动态、攻略交流、建议反馈与水区。',
};

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

const PAGE_SIZE = 15;

export default async function ForumPage({ searchParams }: PageProps) {
  const { page: pageParam } = await searchParams;
  const requestedPage = Number(pageParam ?? '1');
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [categories, posts] = await Promise.all([
    publicApiFetch<ForumCategory[]>('/api/forum/categories'),
    publicApiFetch<Paginated<ForumPostSummary>>(
      `/api/forum/posts?page=${page}&pageSize=${PAGE_SIZE}`,
    ),
  ]);

  const totalPages =
    posts === null ? 1 : Math.max(1, Math.ceil(posts.total / Math.max(1, posts.pageSize)));
  const pageOutOfRange = posts !== null && posts.items.length === 0 && page > 1;
  const currentPage = Math.min(page, totalPages);

  return (
    <>
      <Breadcrumbs items={[{ label: '首页', href: '/' }, { label: '论坛' }]} />

      <header className="page-head">
        <div>
          <h1>论坛</h1>
          <p className="page-description">服务器动态、攻略与闲聊。</p>
        </div>
        <div className="page-head-actions">
          <Link className="button ghost" href="/forum/growth">
            <Icon name="star" width={16} height={16} />
            成长中心
          </Link>
          <Link className="button primary" href="/forum/new">
            <Icon name="pen" width={16} height={16} />
            发起新话题
          </Link>
        </div>
      </header>

      {categories !== null ? (
        <CategoryStrip categories={categories} totalPosts={posts?.total} />
      ) : null}

      {categories === null || posts === null ? (
        <ForumErrorState />
      ) : (
        <div className="forum-layout single">
          <div className="forum-main">
            <section className="panel" aria-labelledby="forum-topics-heading">
              <div className="panel-head">
                <h2 id="forum-topics-heading">最新主题</h2>
                <span className="panel-meta">
                  共 {posts.total} 个主题
                  {totalPages > 1 ? ` · 第 ${currentPage} / ${totalPages} 页` : ''}
                </span>
              </div>
              {pageOutOfRange ? (
                <div className="empty-state">
                  <span className="empty-state-icon">
                    <Icon name="alert" width={22} height={22} />
                  </span>
                  <p>第 {page} 页没有主题，页码可能超出了范围。</p>
                  <Link className="button primary small" href={`/forum?page=${totalPages}`}>
                    前往第 {totalPages} 页
                  </Link>
                </div>
              ) : (
                <>
                  <PostList posts={posts.items} emptyText="论坛还没有帖子，来发起第一个话题吧。" />
                  <Pagination
                    page={posts.page}
                    pageSize={posts.pageSize}
                    total={posts.total}
                    buildHref={(target) => (target === 1 ? '/forum' : `/forum?page=${target}`)}
                  />
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
