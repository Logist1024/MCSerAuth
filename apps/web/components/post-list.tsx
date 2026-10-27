import type { ForumPostSummary } from '@mcserauth/shared';
import Link from 'next/link';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { categoryStyle } from '@/lib/forum-ui';
import Avatar from './avatar';
import { UserBadges } from './growth/user-badges';
import { Icon } from './icons';

/** Dense, forum-style topic list used by the home page, categories and profiles. */
export default function PostList({
  posts,
  emptyText = '这里还没有帖子。',
  showCategory = true,
  showEmptyAction = true,
}: {
  posts: ForumPostSummary[];
  emptyText?: string;
  showCategory?: boolean;
  showEmptyAction?: boolean;
}) {
  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">
          <Icon name="message" width={22} height={22} />
        </span>
        <p>{emptyText}</p>
        {showEmptyAction ? (
          <Link className="button primary small" href="/forum/new">
            <Icon name="plus" width={16} height={16} />
            发起第一个话题
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="topic-list" aria-label="主题列表">
      {posts.map((post) => (
        <li className="topic-row" key={post.id}>
          <div className="topic-avatar">
            <Link href={`/users/${post.author.id}`} aria-label={`查看 ${post.author.name} 的主页`}>
              <Avatar name={post.author.name} src={post.author.avatarUrl} size="md" />
            </Link>
          </div>

          <div className="topic-body">
            <div className="topic-badges">
              {showCategory ? (
                <Link
                  className="category-pill"
                  href={`/forum/${post.category.slug}`}
                  style={categoryStyle(post.category.slug)}
                >
                  <span className="category-dot" aria-hidden="true" />
                  {post.category.name}
                </Link>
              ) : null}
              {post.pinned ? (
                <span className="flag flag-pinned">
                  <Icon name="pin" width={12} height={12} />
                  置顶
                </span>
              ) : null}
              {post.featured ? (
                <span className="flag flag-featured">
                  <Icon name="star" width={12} height={12} />
                  精华
                </span>
              ) : null}
              {post.locked ? (
                <span className="flag flag-locked">
                  <Icon name="lock" width={12} height={12} />
                  已锁定
                </span>
              ) : null}
              {post.status !== 'published' ? (
                <span className="flag flag-hidden">{post.status}</span>
              ) : null}
            </div>

            <Link className="topic-title" href={`/forum/post/${post.id}`}>
              {post.title}
            </Link>
            <p className="topic-excerpt" title={post.excerpt}>
              {post.excerpt}
            </p>

            <div className="topic-meta">
              <Link className="topic-author" href={`/users/${post.author.id}`}>
                {post.author.name}
              </Link>
              {post.author.player ? (
                <span className="player-badge">
                  <Icon name="gamepad" width={12} height={12} />
                  {post.author.player.nickname}
                </span>
              ) : null}
              <UserBadges author={post.author} />
              <span className="meta-dot" aria-hidden="true">
                ·
              </span>
              <time dateTime={post.createdAt} title={formatDateTime(post.createdAt)}>
                发布于 {formatRelativeTime(post.createdAt)}
              </time>
              <span className="topic-meta-inline-metrics">
                <span className="metric" title={`${post.replyCount} 条回复`}>
                  <Icon name="message" width={14} height={14} />
                  <span>{post.replyCount}</span>
                  <span className="sr-only">条回复</span>
                </span>
                <span className="metric" title={`${post.voteCount} 个赞`}>
                  <Icon name="thumbsUp" width={14} height={14} />
                  <span>{post.voteCount}</span>
                  <span className="sr-only">个赞</span>
                </span>
              </span>
            </div>
          </div>

          <div className="topic-metrics" aria-label="主题数据">
            <span className="metric" title={`${post.replyCount} 条回复`}>
              <Icon name="message" width={15} height={15} />
              <span>{post.replyCount}</span>
              <span className="sr-only">条回复</span>
            </span>
            <span className="metric" title={`${post.voteCount} 个赞`}>
              <Icon name="thumbsUp" width={15} height={15} />
              <span>{post.voteCount}</span>
              <span className="sr-only">个赞</span>
            </span>
          </div>

          <div className="topic-activity">
            <span className="topic-activity-label">最后活跃</span>
            <time
              className="topic-activity-time"
              dateTime={post.lastActivityAt}
              title={formatDateTime(post.lastActivityAt)}
            >
              {formatRelativeTime(post.lastActivityAt)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );
}
