import type { ForumCategory } from '@mcserauth/shared';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/format';
import { categoryStyle } from '@/lib/forum-ui';
import { Icon } from './icons';

/**
 * 传统论坛（Discuz/phpBB）风格的版块卡网格：每个一级版块一卡，
 * 展示描述、主题数、最后活跃与子版块链接，供论坛首页使用。
 */
export default function CategoryBoard({ categories }: { categories: ForumCategory[] }) {
  return (
    <section className="category-board" aria-label="版块列表">
      {categories.map((category) => (
        <article className="category-board-card" key={category.id}>
          <span
            className="category-board-icon"
            style={categoryStyle(category.slug)}
            aria-hidden="true"
          >
            <Icon name="message" width={16} height={16} />
          </span>
          <div className="category-board-main">
            <Link className="category-board-name" href={`/forum/${category.slug}`}>
              {category.name}
            </Link>
            {category.description !== null ? (
              <p className="category-board-desc">{category.description}</p>
            ) : null}
            {category.children.length > 0 ? (
              <div className="category-board-children">
                {category.children.map((child) => (
                  <Link
                    className="category-pill"
                    key={child.id}
                    href={`/forum/${child.slug}`}
                    style={categoryStyle(child.slug)}
                  >
                    <span className="category-dot" aria-hidden="true" />
                    {child.name}
                    <span className="category-board-child-count">{child.postCount}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <div className="category-board-stats">
            <span className="category-board-count">
              <strong>{category.postCount}</strong>
              <span>主题</span>
            </span>
            <span className="category-board-last">
              {category.lastActivityAt !== null ? (
                <>
                  最后活跃
                  <time dateTime={category.lastActivityAt}>
                    {formatRelativeTime(category.lastActivityAt)}
                  </time>
                </>
              ) : (
                '暂无主题'
              )}
            </span>
          </div>
        </article>
      ))}
    </section>
  );
}
