import type { ForumCategory } from '@mcserauth/shared';
import Link from 'next/link';
import { categoryStyle } from '@/lib/forum-ui';
import { Icon } from './icons';

function CategoryRow({
  category,
  activeSlug,
  depth,
}: {
  category: ForumCategory;
  activeSlug?: string;
  depth: number;
}) {
  const active = category.slug === activeSlug;
  return (
    <li>
      <Link
        className={`category-nav-item${active ? ' active' : ''}`}
        href={`/forum/${category.slug}`}
        aria-current={active ? 'page' : undefined}
        style={depth > 0 ? { paddingLeft: `${0.65 + depth * 1.1}rem` } : undefined}
      >
        <span className="category-dot" style={categoryStyle(category.slug)} aria-hidden="true" />
        <span className="category-nav-name">{category.name}</span>
        <span className="category-count">{category.postCount}</span>
      </Link>
      {category.children.length > 0 ? (
        <ul className="category-nav-children">
          {category.children.map((child) => (
            <CategoryRow
              key={child.id}
              category={child}
              activeSlug={activeSlug}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function CategoryNav({
  categories,
  activeSlug,
  totalPosts,
}: {
  categories: ForumCategory[];
  activeSlug?: string;
  totalPosts?: number;
}) {
  return (
    <nav className="side-card category-nav" aria-label="版块导航">
      <div className="side-card-head">
        <h2>版块</h2>
        <span className="muted tiny-text">{categories.length} 个分区</span>
      </div>
      <ul className="category-nav-list">
        <li>
          <Link
            className={`category-nav-item${activeSlug === undefined ? ' active' : ''}`}
            href="/forum"
            aria-current={activeSlug === undefined ? 'page' : undefined}
          >
            <span className="category-all-icon">
              <Icon name="home" width={15} height={15} />
            </span>
            <span className="category-nav-name">全部主题</span>
            {totalPosts !== undefined ? <span className="category-count">{totalPosts}</span> : null}
          </Link>
        </li>
        {categories.map((category) => (
          <CategoryRow key={category.id} category={category} activeSlug={activeSlug} depth={0} />
        ))}
      </ul>
      <Link className="side-card-foot" href="/forum/rss.xml">
        <Icon name="rss" width={15} height={15} />
        RSS 订阅最新主题
      </Link>
    </nav>
  );
}
