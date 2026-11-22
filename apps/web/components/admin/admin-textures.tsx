'use client';

import type { AdminTextureView, Paginated } from '@mcserauth/shared';
import { useCallback, useEffect, useState } from 'react';
import TextureCard from '@/components/textures/texture-card';
import { adminApproveTexture, adminListTextures, adminRejectTexture } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';

const STATUS_LABELS: Record<AdminTextureView['status'], string> = {
  pending: '待处理',
  approved: '正常',
  rejected: '已下架',
};
const PAGE_SIZE = 20;

/** Post-moderation texture list: uploads are live, staff can take them down. */
export default function AdminTextures() {
  const [data, setData] = useState<Paginated<AdminTextureView> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<'all' | 'approved' | 'rejected'>('all');
  const [page, setPage] = useState(1);
  const textures = data?.items ?? null;

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(
        await adminListTextures({
          status: filter === 'all' ? undefined : filter,
          page,
          pageSize: PAGE_SIZE,
        }),
      );
    } catch (fetchError) {
      setError(describeApiError(fetchError));
    }
  }, [filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: number, action: 'approve' | 'reject'): Promise<void> {
    const reason = notes[id]?.trim() || undefined;
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      if (action === 'approve') {
        await adminApproveTexture(id, reason);
        setNotice(`纹理 #${id} 已恢复并设为当前。`);
      } else {
        await adminRejectTexture(id, reason);
        setNotice(`纹理 #${id} 已下架。`);
      }
      setNotes((prev) => ({ ...prev, [id]: '' }));
      await load();
    } catch (reviewError) {
      setError(describeApiError(reviewError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card">
      <div className="section-heading">
        <h2>纹理管理</h2>
        <div className="inline-form">
          <select
            value={filter}
            aria-label="按状态筛选纹理"
            onChange={(event) => {
              setFilter(event.target.value as typeof filter);
              setPage(1);
            }}
          >
            <option value="all">全部</option>
            <option value="approved">正常</option>
            <option value="rejected">已下架</option>
          </select>
          <button className="button secondary" type="button" onClick={load}>
            刷新
          </button>
        </div>
      </div>
      <p className="muted small">
        皮肤上传后立即生效，无需事前审核。这里用于处理违规纹理：下架后玩家会回退到默认形象。
      </p>
      {notice !== null ? (
        <p className="ok" role="status">
          {notice}
        </p>
      ) : null}
      {error !== null ? (
        <p className="bad" role="alert">
          {error}
        </p>
      ) : null}
      {textures === null ? <p className="muted">加载中…</p> : null}
      {textures !== null && textures.length === 0 ? (
        <p className="texture-empty">没有符合条件的纹理。</p>
      ) : null}

      {textures !== null && textures.length > 0 ? (
        <div className="texture-grid">
          {textures.map((texture) => (
            <TextureCard
              key={texture.id}
              url={texture.url}
              alt={`纹理 ${texture.id}`}
              meta={`#${texture.id} · ${texture.nickname}`}
            >
              <span className="texture-meta">
                {texture.kind}
                {texture.variant ? ` / ${texture.variant}` : ''} · {STATUS_LABELS[texture.status]}
                {texture.isActive ? ' · 使用中' : ''}
              </span>
              <span className="texture-meta">{formatDateTime(texture.uploadedAt)}</span>
              <label className="review-note">
                <span className="sr-only">纹理 #{texture.id} 处理备注</span>
                <input
                  className="review-reason"
                  type="text"
                  maxLength={200}
                  placeholder="备注（可留空）"
                  value={notes[texture.id] ?? ''}
                  disabled={busy !== null}
                  onChange={(event) =>
                    setNotes((prev) => ({ ...prev, [texture.id]: event.target.value }))
                  }
                />
              </label>
              <div className="actions">
                {texture.status === 'rejected' ? (
                  <button
                    className="button tiny"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void review(texture.id, 'approve')}
                  >
                    恢复
                  </button>
                ) : (
                  <button
                    className="button tiny danger"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void review(texture.id, 'reject')}
                  >
                    下架
                  </button>
                )}
              </div>
            </TextureCard>
          ))}
        </div>
      ) : null}

      {data !== null && data.total > PAGE_SIZE ? (
        <div className="inline-form">
          <button
            className="button secondary"
            type="button"
            disabled={page <= 1 || busy !== null}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </button>
          <span className="muted small">
            第 {page} / {Math.max(1, Math.ceil(data.total / PAGE_SIZE))} 页 · 共 {data.total} 条
          </span>
          <button
            className="button secondary"
            type="button"
            disabled={page >= Math.ceil(data.total / PAGE_SIZE) || busy !== null}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </button>
        </div>
      ) : null}
    </section>
  );
}
