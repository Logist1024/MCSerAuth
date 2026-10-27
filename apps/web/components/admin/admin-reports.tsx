'use client';

import type { AdminReport, Paginated, ReportStatus } from '@mcserauth/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { adminListReports, adminRejectReport, adminResolveReport } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';

const STATUS_OPTIONS: ReportStatus[] = ['pending', 'resolved', 'rejected'];

export default function AdminReports() {
  const [status, setStatus] = useState<ReportStatus>('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AdminReport> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminListReports({ status, page, pageSize: 20 }));
    } catch (fetchError) {
      setError(describeApiError(fetchError));
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handle(id: number, outcome: 'resolved' | 'rejected'): Promise<void> {
    const reason = notes[id]?.trim() || undefined;
    setBusy(id);
    setError(null);
    try {
      if (outcome === 'resolved') {
        await adminResolveReport(id, { reason });
      } else {
        await adminRejectReport(id, { reason });
      }
      setNotes((prev) => ({ ...prev, [id]: '' }));
      await load();
    } catch (handleError) {
      setError(describeApiError(handleError));
    } finally {
      setBusy(null);
    }
  }

  function targetHref(report: AdminReport): string | null {
    if (report.targetType === 'post') {
      return `/forum/post/${report.targetId}`;
    }
    if (report.targetType === 'user') {
      return `/users/${report.targetId}`;
    }
    return null;
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="card">
      <div className="section-heading">
        <h2>举报队列</h2>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ReportStatus);
            setPage(1);
          }}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      {error !== null ? (
        <p className="bad" role="alert">
          {error}
        </p>
      ) : null}
      {data === null ? <p className="muted">加载中…</p> : null}
      {data !== null && data.items.length === 0 ? (
        <p className="texture-empty">暂无举报。</p>
      ) : null}
      {data !== null && data.items.length > 0 ? (
        <ul className="admin-list">
          {data.items.map((report) => {
            const href = targetHref(report);
            return (
              <li className="admin-list-item" key={report.id}>
                <div>
                  <strong>
                    #{report.id} {report.targetType} / {report.targetId}
                  </strong>
                  {href ? (
                    <Link className="muted small" href={href}>
                      {' '}
                      查看对象
                    </Link>
                  ) : null}
                  <p>{report.reason}</p>
                  <p className="muted small">
                    举报人 {report.reporter.name} · {formatDateTime(report.createdAt)}
                    {report.handledBy ? ` · 处理人 ${report.handledBy.name}` : ''}
                  </p>
                </div>
                {report.status === 'pending' ? (
                  <div className="actions">
                    <label className="review-note">
                      <span className="sr-only">举报 #{report.id} 处理备注</span>
                      <input
                        className="review-reason"
                        type="text"
                        maxLength={200}
                        placeholder="备注（可留空）"
                        value={notes[report.id] ?? ''}
                        disabled={busy !== null}
                        onChange={(event) =>
                          setNotes((prev) => ({ ...prev, [report.id]: event.target.value }))
                        }
                      />
                    </label>
                    <button
                      className="button tiny"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void handle(report.id, 'resolved')}
                    >
                      已处理
                    </button>
                    <button
                      className="button tiny secondary"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void handle(report.id, 'rejected')}
                    >
                      驳回
                    </button>
                  </div>
                ) : (
                  <span className="muted small">{report.status}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {data !== null && totalPages > 1 ? (
        <div className="pagination">
          <button
            className="button secondary"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            上一页
          </button>
          <span className="muted small">
            {page} / {totalPages}
          </span>
          <button
            className="button secondary"
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </button>
        </div>
      ) : null}
    </section>
  );
}
