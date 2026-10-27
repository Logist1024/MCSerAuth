import type { ForumCategory } from '@mcserauth/shared';
import Link from 'next/link';
import { categoryStyle } from '@/lib/forum-ui';
import { Icon } from './icons';

/** Horizontal category switcher shown above topic lists on narrow screens. */
export default function CategoryStrip({
  categories,
  activeSlug,
  totalPosts,
}: {
  categories: ForumCategory[];
  activeSlug?: string;
  totalPosts?: number;
}) {
  return (
    <nav className="category-strip" aria-label="版块快捷导航">
      <Link
        className={`category-strip-item${activeSlug === undefined ? ' active' : ''}`}
        href="/forum"
        aria-current={activeSlug === undefined ? 'page' : undefined}
      >
        <Icon name="home" width={14} height={14} />
        全部
        {totalPosts !== undefined ? (
          <span className="category-strip-count">{totalPosts}</span>
        ) : null}
      </Link>
      {categories.map((category) => {
        const active = category.slug === activeSlug;
        return (
          <Link
            className={`category-strip-item${active ? ' active' : ''}`}
            href={`/forum/${category.slug}`}
            aria-current={active ? 'page' : undefined}
            key={category.id}
          >
            <span
              className="category-dot"
              style={categoryStyle(category.slug)}
              aria-hidden="true"
            />
            {category.name}
            <span className="category-strip-count">{category.postCount}</span>
          </Link>
        );
      })}
    </nav>
  );
}
