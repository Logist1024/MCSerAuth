'use client';

import type { AdminStats } from '@mcserauth/shared';
import { useCallback, useEffect, useState } from 'react';
import { adminFetchStats } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';

export default function AdminOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStats(await adminFetchStats());
    } catch (fetchError) {
      setError(describeApiError(fetchError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = stats
    ? [
        { label: '用户', value: stats.users.total, sub: `封禁 ${stats.users.banned}` },
        { label: '玩家', value: stats.players.total, sub: `封禁 ${stats.players.banned}` },
        {
          label: '帖子',
          value: stats.posts.total,
          sub: `已发布 ${stats.posts.published} · 待审 ${stats.posts.pending}`,
        },
        {
          label: '回复',
          value: stats.replies.total,
          sub: `已发布 ${stats.replies.published}`,
        },
        {
          label: '举报',
          value: stats.reports.pending,
          sub: `已处理 ${stats.reports.resolved} · 驳回 ${stats.reports.rejected}`,
        },
        {
          label: '纹理',
          value: stats.skins.approved,
          sub: `下架 ${stats.skins.rejected}`,
        },
        { label: '有效令牌', value: stats.tokens.active, sub: '启动器授权设备' },
        { label: '版块', value: stats.categories, sub: '论坛分区' },
      ]
    : [];

  return (
    <section className="card">
      <div className="section-heading">
        <h2>运营概览</h2>
        <button className="button secondary" type="button" onClick={load}>
          刷新
        </button>
      </div>
      {error !== null ? <p className="bad">{error}</p> : null}
      {stats === null ? (
        <p className="muted">加载中…</p>
      ) : (
        <div className="stat-grid">
          {cards.map((card) => (
            <div className="stat-card" key={card.label}>
              <span className="stat-label">{card.label}</span>
              <strong className="stat-value">{card.value}</strong>
              <span className="muted small">{card.sub}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
