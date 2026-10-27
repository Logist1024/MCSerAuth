import { Icon } from './icons';

function Line({ width }: { width: string }) {
  return <span className="skeleton-line" style={{ width }} />;
}

function TopicRowSkeleton() {
  return (
    <div className="skeleton-row">
      <span className="skeleton-avatar" />
      <div className="skeleton-stack">
        <Line width="38%" />
        <Line width="82%" />
        <Line width="56%" />
      </div>
      <div className="skeleton-stack skeleton-row-metrics">
        <Line width="70%" />
        <Line width="52%" />
      </div>
    </div>
  );
}

export function TopicListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skeleton-panel" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <TopicRowSkeleton key={index} />
      ))}
    </div>
  );
}

export function ForumPageSkeleton() {
  return (
    <div className="forum-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">正在加载论坛内容…</span>
      <div aria-hidden="true">
        <div className="page-head">
          <div className="skeleton-stack" style={{ width: 'min(34rem, 100%)' }}>
            <Line width="6rem" />
            <Line width="min(18rem, 80%)" />
            <Line width="100%" />
            <Line width="76%" />
          </div>
        </div>
        <div className="forum-layout">
          <div className="forum-main">
            <section className="panel">
              <div className="panel-head">
                <Line width="7rem" />
                <Line width="5rem" />
              </div>
              <TopicListSkeleton rows={7} />
            </section>
          </div>
          <aside className="forum-side">
            <section className="side-card skeleton-stack">
              <Line width="4rem" />
              <Line width="100%" />
              <Line width="88%" />
              <Line width="94%" />
              <Line width="70%" />
            </section>
            <section className="side-card skeleton-stack">
              <Line width="5rem" />
              <Line width="100%" />
              <Line width="82%" />
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function TopicPageSkeleton() {
  return (
    <div className="forum-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">正在加载主题内容…</span>
      <div aria-hidden="true">
        <div className="skeleton-stack" style={{ width: '14rem', marginBottom: '1rem' }}>
          <Line width="100%" />
        </div>
        <div className="topic-layout">
          <div className="topic-main">
            <section className="topic-head skeleton-stack">
              <Line width="7rem" />
              <Line width="min(26rem, 90%)" />
              <Line width="16rem" />
            </section>
            {[0, 1, 2].map((item) => (
              <section className="post skeleton-post" key={item}>
                <div className="skeleton-post-author">
                  <span className="skeleton-avatar" />
                  <Line width="4.5rem" />
                </div>
                <div className="skeleton-stack">
                  <Line width="7rem" />
                  <Line width="100%" />
                  <Line width="92%" />
                  <Line width="64%" />
                </div>
              </section>
            ))}
            <section className="panel skeleton-stack">
              <Line width="9rem" />
              <span className="skeleton-block" style={{ height: '9rem' }} />
              <Line width="6rem" />
            </section>
          </div>
          <aside className="topic-side">
            <section className="side-card skeleton-stack">
              <Line width="5rem" />
              <Line width="100%" />
              <Line width="86%" />
              <Line width="72%" />
            </section>
            <section className="side-card skeleton-stack">
              <Line width="6rem" />
              <Line width="100%" />
              <Line width="80%" />
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function ComposerPageSkeleton() {
  return (
    <div className="forum-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">正在加载编辑器…</span>
      <div aria-hidden="true">
        <div className="skeleton-stack" style={{ width: '14rem', marginBottom: '1rem' }}>
          <Line width="100%" />
        </div>
        <div className="page-head">
          <div className="skeleton-stack" style={{ width: 'min(30rem, 100%)' }}>
            <Line width="5rem" />
            <Line width="min(16rem, 80%)" />
            <Line width="100%" />
          </div>
        </div>
        <div className="composer-layout">
          <section className="composer-main skeleton-stack">
            <div className="composer-head skeleton-stack">
              <Line width="9rem" />
              <Line width="min(26rem, 92%)" />
            </div>
            <div className="skeleton-stack" style={{ padding: '1rem 1.15rem' }}>
              <Line width="100%" />
              <Line width="94%" />
              <Line width="72%" />
            </div>
            <span className="skeleton-block" style={{ height: '14rem' }} />
          </section>
          <aside className="composer-side">
            <section className="side-card skeleton-stack">
              <Line width="5rem" />
              <Line width="100%" />
              <Line width="90%" />
              <Line width="78%" />
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function ForumErrorState({
  title = '论坛数据加载失败',
  description = '请确认 API 服务已启动，或稍后刷新页面重试。',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="panel">
      <div className="empty-state">
        <span className="empty-state-icon">
          <Icon name="alert" width={22} height={22} />
        </span>
        <p>{title}</p>
        <p className="muted small">{description}</p>
      </div>
    </section>
  );
}
