import type { ForumCategory, ForumPostSummary, Paginated } from '@mcserauth/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Breadcrumbs from '@/components/breadcrumbs';
import CategoryStrip from '@/components/category-strip';
import { ForumErrorState } from '@/components/forum-skeleton';
import { Icon } from '@/components/icons';
import Pagination from '@/components/pagination';
import PostList from '@/components/post-list';
import { findCategory, findCategoryPath } from '@/lib/categories';
import { categoryStyle } from '@/lib/forum-ui';
import { publicApiFetch } from '@/lib/server-api';

export const revalidate = 30;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

const PAGE_SIZE = 20;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const categories = await publicApiFetch<ForumCategory[]>('/api/forum/categories');
  const category = categories ? findCategory(categories, slug) : null;
  return {
    title: category ? `${category.name} · 论坛` : '版块',
    description: category?.description ?? undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const requestedPage = Number(pageParam ?? '1');
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [categories, posts] = await Promise.all([
    publicApiFetch<ForumCategory[]>('/api/forum/categories'),
    publicApiFetch<Paginated<ForumPostSummary>>(
      `/api/forum/posts?categorySlug=${encodeURIComponent(slug)}&page=${page}&pageSize=${PAGE_SIZE}`,
    ),
  ]);

  if (categories === null || posts === null) {
    return <ForumErrorState title="版块数据加载失败" />;
  }

  const path = findCategoryPath(categories, slug);
  const category = path.at(-1);
  if (category === undefined) {
    notFound();
  }

  const totalPages = Math.max(1, Math.ceil(posts.total / Math.max(1, posts.pageSize)));
  const pageOutOfRange = posts.items.length === 0 && page > 1;
  const currentPage = Math.min(page, totalPages);
  const breadcrumbItems = [
    { label: '首页', href: '/' },
    { label: '论坛', href: '/forum' },
    ...path.map((item, index) =>
      index === path.length - 1
        ? { label: item.name, title: item.description ?? item.name }
        : { label: item.name, href: `/forum/${item.slug}` },
    ),
  ];

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />

      <header className="page-head">
        <div>
          <h1>{category.name}</h1>
          <p className="page-description">{category.description ?? '这个版块还没有简介。'}</p>
          {category.children.length > 0 ? (
            <div className="child-category-links">
              {category.children.map((child) => (
                <Link
                  className="category-pill"
                  key={child.id}
                  href={`/forum/${child.slug}`}
                  style={categoryStyle(child.slug)}
                >
                  <span className="category-dot" aria-hidden="true" />
                  {child.name}
                  <span className="child-category-count">{child.postCount}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="page-head-actions">
          <Link className="button primary" href={`/forum/new?category=${category.slug}`}>
            <Icon name="pen" width={16} height={16} />
            在本版发帖
          </Link>
        </div>
      </header>

      <CategoryStrip categories={categories} activeSlug={category.slug} />

      <div className="forum-layout single">
        <div className="forum-main">
          <section className="panel" aria-labelledby="category-topics-heading">
            <div className="panel-head">
              <h2 id="category-topics-heading">主题</h2>
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
                <Link
                  className="button primary small"
                  href={
                    totalPages === 1
                      ? `/forum/${category.slug}`
                      : `/forum/${category.slug}?page=${totalPages}`
                  }
                >
                  前往第 {totalPages} 页
                </Link>
              </div>
            ) : (
              <>
                <PostList
                  posts={posts.items}
                  showCategory={false}
                  emptyText="该版块还没有帖子，来发第一帖吧。"
                />
                <Pagination
                  page={posts.page}
                  pageSize={posts.pageSize}
                  total={posts.total}
                  buildHref={(target) =>
                    target === 1
                      ? `/forum/${category.slug}`
                      : `/forum/${category.slug}?page=${target}`
                  }
                />
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
