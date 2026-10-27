import {
  roleAtLeast,
  type ForumAuthor,
  type ForumPostDetail,
  type ForumReply,
  type UserSettingsResponse,
} from '@mcserauth/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminPostControls, { AdminReplyControls } from '@/components/admin-post-controls';
import Avatar from '@/components/avatar';
import Breadcrumbs from '@/components/breadcrumbs';
import CopyLinkButton from '@/components/copy-link-button';
import { UserBadges } from '@/components/growth/user-badges';
import { Icon } from '@/components/icons';
import Markdown from '@/components/markdown';
import OwnerActions from '@/components/owner-actions';
import Pagination from '@/components/pagination';
import QuoteButton from '@/components/quote-button';
import ReplyForm from '@/components/reply-form';
import ReportButton from '@/components/report-button';
import TipAuthorButton from '@/components/tip-author-button';
import TopicFloatingActions from '@/components/topic-floating-actions';
import VoteButton from '@/components/vote-button';
import { formatDate, formatDateTime, formatRelativeTime } from '@/lib/format';
import { categoryStyle, roleClass, roleLabel } from '@/lib/forum-ui';
import { serverApiFetch } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ replyPage?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await serverApiFetch<ForumPostDetail>(`/api/forum/posts/${id}`);
  return {
    title: post ? `${post.title} · 论坛` : '帖子',
    description: post?.excerpt,
    openGraph: post
      ? {
          title: post.title,
          description: post.excerpt,
          type: 'article',
        }
      : undefined,
  };
}

function AuthorAside({ author, op = false }: { author: ForumAuthor; op?: boolean }) {
  const elevated = roleAtLeast(author.role, 'reviewer');
  return (
    <aside className="post-author">
      <Avatar name={author.name} src={author.avatarUrl} size="md" />
      <Link className="post-author-name" href={`/users/${author.id}`}>
        {author.name}
      </Link>
      {elevated ? (
        <span className={`role-badge ${roleClass(author.role)}`}>{roleLabel(author.role)}</span>
      ) : null}
      {author.player ? (
        <span className="player-badge">
          <Icon name="gamepad" width={12} height={12} />
          {author.player.nickname}
        </span>
      ) : null}
      <UserBadges author={author} />
      {op ? <span className="post-author-meta">主题作者</span> : null}
    </aside>
  );
}

function ReplyRow({
  reply,
  viewer,
  isModerator,
  canReply,
  postAuthorId,
}: {
  reply: ForumReply;
  viewer: UserSettingsResponse['user'] | null;
  isModerator: boolean;
  canReply: boolean;
  postAuthorId: string;
}) {
  const isAuthor = viewer?.id === reply.author.id;
  return (
    <article
      className="post"
      id={`reply-${reply.id}`}
      aria-label={`第 ${reply.floor} 楼，作者 ${reply.author.name}`}
    >
      <AuthorAside author={reply.author} op={reply.author.id === postAuthorId} />
      <div className="post-content">
        <div className="post-head">
          <div className="post-head-left">
            <a
              className="post-floor"
              href={`#reply-${reply.id}`}
              aria-label={`第 ${reply.floor} 楼，跳转到本楼`}
            >
              #{reply.floor}
            </a>
            <time dateTime={reply.createdAt} title={formatDateTime(reply.createdAt)}>
              {formatRelativeTime(reply.createdAt)}
            </time>
            {reply.status !== 'published' ? (
              <span className="flag flag-hidden">{reply.status}</span>
            ) : null}
          </div>
          <div className="post-actions" role="group" aria-label="本楼操作">
            {canReply ? (
              <QuoteButton
                author={reply.author.name}
                floor={reply.floor}
                content={reply.contentMd}
              />
            ) : null}
            <CopyLinkButton
              path={`/forum/post/${reply.postId}#reply-${reply.id}`}
              title={`复制第 ${reply.floor} 楼链接`}
            />
            {isAuthor ? (
              <OwnerActions kind="reply" id={reply.id} showDelete={!isModerator} />
            ) : null}
            {isModerator ? <AdminReplyControls replyId={reply.id} status={reply.status} /> : null}
            {viewer !== null ? (
              <ReportButton targetType="reply" targetId={String(reply.id)} />
            ) : null}
          </div>
        </div>

        <div className="post-body">
          <Markdown content={reply.contentMd} />
        </div>

        <div className="post-foot">
          <VoteButton
            targetType="reply"
            targetId={reply.id}
            initialVoted={reply.viewerVoted}
            initialCount={reply.voteCount}
            signedIn={viewer !== null}
            loginHref={`/login?next=${encodeURIComponent(`/forum/post/${reply.postId}#reply-${reply.id}`)}`}
          />
        </div>
      </div>
    </article>
  );
}

export default async function PostPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { replyPage: replyPageParam } = await searchParams;
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) {
    notFound();
  }

  const requestedReplyPage = Number(replyPageParam ?? '1');
  const replyPage =
    Number.isInteger(requestedReplyPage) && requestedReplyPage > 0 ? requestedReplyPage : 1;

  const [post, settings] = await Promise.all([
    serverApiFetch<ForumPostDetail>(`/api/forum/posts/${postId}?replyPage=${replyPage}`),
    serverApiFetch<UserSettingsResponse>('/api/user/settings'),
  ]);
  if (post === null) {
    notFound();
  }

  const lastReplyPage = Math.max(1, Math.ceil(post.replyTotal / Math.max(1, post.replyPageSize)));
  const replyPageOutOfRange = post.replyTotal > 0 && post.replies.length === 0;
  const replyPageHref = (target: number): string =>
    `/forum/post/${post.id}?replyPage=${target}#reply`;

  const viewer = settings?.user ?? null;
  const isModerator = roleAtLeast(viewer?.role, 'reviewer');
  const isAuthor = viewer?.id === post.author.id;
  const canReply =
    viewer !== null &&
    !viewer.banned &&
    (viewer.mutedUntil === null || new Date(viewer.mutedUntil).getTime() <= Date.now()) &&
    (!post.locked || isModerator);
  const loginHref = `/login?next=${encodeURIComponent(`/forum/post/${post.id}#reply`)}`;

  const participants = [
    ...new Map(
      [post.author, ...post.replies.map((reply) => reply.author)].map((author) => [
        author.id,
        author,
      ]),
    ).values(),
  ];
  const latestReply = post.replies.at(-1);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: '首页', href: '/' },
          { label: '论坛', href: '/forum' },
          { label: post.category.name, href: `/forum/${post.category.slug}` },
          { label: post.title, title: post.title },
        ]}
      />

      <div className="topic-layout">
        <div className="topic-main">
          <header className="topic-head">
            <div className="topic-head-badges">
              <Link
                className="category-pill"
                href={`/forum/${post.category.slug}`}
                style={categoryStyle(post.category.slug)}
              >
                <span className="category-dot" aria-hidden="true" />
                {post.category.name}
              </Link>
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

            <h1 className="topic-title-lg">{post.title}</h1>

            <div className="topic-head-meta">
              <Avatar name={post.author.name} src={post.author.avatarUrl} size="sm" />
              <Link className="topic-head-author" href={`/users/${post.author.id}`}>
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
              <span className="meta-dot" aria-hidden="true">
                ·
              </span>
              <span>{post.replyCount} 条回复</span>
            </div>

            {isModerator ? (
              <details className="mod-panel">
                <summary>
                  <Icon name="shield" width={14} height={14} />
                  管理工具
                </summary>
                <AdminPostControls
                  postId={post.id}
                  status={post.status}
                  pinned={post.pinned}
                  featured={post.featured}
                  locked={post.locked}
                />
              </details>
            ) : null}

            <div className="topic-head-actions">
              {canReply ? (
                <a className="button primary small" href="#reply">
                  <Icon name="reply" width={15} height={15} />
                  回复主题
                </a>
              ) : viewer === null ? (
                <Link className="button primary small" href={loginHref}>
                  <Icon name="reply" width={15} height={15} />
                  登录后回复
                </Link>
              ) : (
                <span className="flag flag-locked">
                  <Icon name="lock" width={12} height={12} />
                  {viewer.banned ? '账号已被封禁' : '帖子已锁定'}
                </span>
              )}
              {latestReply !== undefined ? (
                <a className="button ghost small" href={`#reply-${latestReply.id}`}>
                  <Icon name="chevronDown" width={15} height={15} />
                  最新回复
                </a>
              ) : null}
            </div>
          </header>

          <div className="post-stream">
            <article
              className="post"
              id={`post-${post.id}`}
              aria-label={`楼主帖，作者 ${post.author.name}`}
            >
              <AuthorAside author={post.author} op />
              <div className="post-content">
                <div className="post-head">
                  <div className="post-head-left">
                    <span className="op-badge">楼主</span>
                    <time dateTime={post.createdAt} title={formatDateTime(post.createdAt)}>
                      {formatDateTime(post.createdAt)}
                    </time>
                  </div>
                  <div className="post-actions" role="group" aria-label="楼主帖操作">
                    {canReply ? (
                      <QuoteButton
                        author={post.author.name}
                        floor={null}
                        content={post.contentMd}
                      />
                    ) : null}
                    <CopyLinkButton
                      path={`/forum/post/${post.id}#post-${post.id}`}
                      title="复制楼主帖链接"
                    />
                    {isAuthor ? (
                      <OwnerActions
                        kind="post"
                        id={post.id}
                        editHref={`/forum/post/${post.id}/edit`}
                        redirectTo={`/forum/${post.category.slug}`}
                        showDelete={!isModerator}
                      />
                    ) : null}
                    {viewer !== null && !isAuthor ? (
                      <TipAuthorButton
                        beneficiaryId={post.author.id}
                        beneficiaryName={post.author.name}
                        postTitle={post.title}
                      />
                    ) : null}
                    {viewer !== null ? (
                      <ReportButton targetType="post" targetId={String(post.id)} />
                    ) : null}
                  </div>
                </div>

                <div className="post-body">
                  <Markdown content={post.contentMd} />
                </div>

                <div className="post-foot">
                  <VoteButton
                    targetType="post"
                    targetId={post.id}
                    initialVoted={post.viewerVoted}
                    initialCount={post.voteCount}
                    signedIn={viewer !== null}
                    loginHref={loginHref}
                  />
                  {canReply ? (
                    <span className="reply-to">
                      <Icon name="message" width={13} height={13} />共 {post.replyCount} 条讨论
                    </span>
                  ) : null}
                </div>
              </div>
            </article>

            {post.replies.map((reply) => (
              <ReplyRow
                key={reply.id}
                reply={reply}
                viewer={viewer}
                isModerator={isModerator}
                canReply={canReply}
                postAuthorId={post.author.id}
              />
            ))}

            {post.replies.length === 0 ? (
              <div className="post-stream-empty">
                <Icon name="message" width={20} height={20} />
                {replyPageOutOfRange ? (
                  <>
                    <strong>这一页没有回复</strong>
                    <Link href={replyPageHref(lastReplyPage)}>前往最后一页</Link>
                  </>
                ) : (
                  <>
                    <strong>还没有回复</strong>
                    <span>{canReply ? '成为第一个参与讨论的人。' : '登录后即可参与讨论。'}</span>
                  </>
                )}
              </div>
            ) : null}
          </div>

          <Pagination
            page={post.replyPage}
            pageSize={post.replyPageSize}
            total={post.replyTotal}
            buildHref={replyPageHref}
            label="回复分页"
          />

          <section className="reply-section" id="reply" aria-labelledby="reply-heading">
            <div className="reply-section-head">
              <h2 id="reply-heading">参与讨论</h2>
              <span className="panel-meta">{post.replyCount} 条回复</span>
            </div>

            {viewer === null ? (
              <div className="composer-main">
                <div className="empty-state">
                  <span className="empty-state-icon">
                    <Icon name="reply" width={22} height={22} />
                  </span>
                  <p>登录后即可参与讨论、点赞和收到回复通知。</p>
                  <div className="actions">
                    <Link className="button primary" href={loginHref}>
                      登录 / 注册
                    </Link>
                    <Link className="button ghost" href="/forum">
                      先逛逛论坛
                    </Link>
                  </div>
                </div>
              </div>
            ) : viewer.banned ? (
              <div className="composer-main">
                <div className="empty-state">
                  <span className="empty-state-icon">
                    <Icon name="alert" width={22} height={22} />
                  </span>
                  <p className="bad">你的账号已被论坛封禁，无法回复。</p>
                  <Link className="button ghost" href="/forum">
                    返回论坛
                  </Link>
                </div>
              </div>
            ) : viewer.mutedUntil !== null && new Date(viewer.mutedUntil).getTime() > Date.now() ? (
              <div className="composer-main">
                <div className="empty-state">
                  <span className="empty-state-icon">
                    <Icon name="alert" width={22} height={22} />
                  </span>
                  <p className="bad">
                    你的账号处于禁言状态，解除时间：{formatDateTime(viewer.mutedUntil)}。
                  </p>
                  <Link className="button ghost" href="/forum">
                    返回论坛
                  </Link>
                </div>
              </div>
            ) : !canReply ? (
              <div className="composer-main">
                <div className="empty-state">
                  <span className="empty-state-icon">
                    <Icon name="lock" width={22} height={22} />
                  </span>
                  <p>帖子已锁定，仅审核员或管理员可以继续回复。</p>
                  <Link className="button ghost" href={`/forum/${post.category.slug}`}>
                    返回 {post.category.name}
                  </Link>
                </div>
              </div>
            ) : (
              <ReplyForm
                postId={post.id}
                viewerName={viewer.name}
                viewerAvatarUrl={viewer.avatarUrl}
                replyCount={post.replyCount}
                replyPageSize={post.replyPageSize}
              />
            )}
          </section>
        </div>

        <aside className="topic-side">
          <section className="side-card">
            <h2>主题信息</h2>
            <dl className="topic-info-list">
              <div className="topic-info-row">
                <dt>版块</dt>
                <dd>
                  <Link href={`/forum/${post.category.slug}`}>{post.category.name}</Link>
                </dd>
              </div>
              <div className="topic-info-row">
                <dt>回复</dt>
                <dd>{post.replyCount}</dd>
              </div>
              <div className="topic-info-row">
                <dt>点赞</dt>
                <dd>{post.voteCount}</dd>
              </div>
              <div className="topic-info-row">
                <dt>发布于</dt>
                <dd>{formatDate(post.createdAt)}</dd>
              </div>
              <div className="topic-info-row">
                <dt>最后活跃</dt>
                <dd>{formatRelativeTime(post.lastActivityAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="side-card">
            <h2>分享主题</h2>
            <p className="side-note">把链接发给朋友，或收藏到浏览器，方便后续跟进讨论。</p>
            <div className="side-card-actions">
              <CopyLinkButton
                path={`/forum/post/${post.id}`}
                label="复制主题链接"
                title="复制主题链接"
              />
            </div>
          </section>

          <section className="side-card">
            <h2>参与者（{participants.length}）</h2>
            <div className="participant-stack" aria-hidden="true">
              {participants.slice(0, 6).map((participant) => (
                <Avatar
                  key={participant.id}
                  name={participant.name}
                  src={participant.avatarUrl}
                  size="sm"
                />
              ))}
              {participants.length > 6 ? (
                <span className="muted small">+{participants.length - 6}</span>
              ) : null}
            </div>
            <ul className="participant-list" aria-label="参与者">
              {participants.slice(0, 6).map((participant) => (
                <li key={participant.id}>
                  <Avatar name={participant.name} src={participant.avatarUrl} size="xs" />
                  <Link href={`/users/${participant.id}`}>{participant.name}</Link>
                  {participant.id === post.author.id ? (
                    <span className="muted tiny-text">楼主</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          {canReply ? (
            <a className="button primary" href="#reply">
              <Icon name="reply" width={16} height={16} />
              参与讨论
            </a>
          ) : null}
          <Link className="button ghost" href={`/forum/${post.category.slug}`}>
            <Icon name="arrowLeft" width={16} height={16} />
            返回 {post.category.name}
          </Link>
        </aside>
      </div>

      <TopicFloatingActions canReply={canReply} />
    </>
  );
}
