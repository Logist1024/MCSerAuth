'use client';

import { useEffect, useRef, useState } from 'react';
import type { PointReason, PointTransactionSummary } from '@mcserauth/shared';
import { fetchPointTransactions } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import Pagination from '@/components/pagination';

const REASON_LABELS: Record<PointReason, string> = {
  checkin: '每日签到',
  xp_boost: '购买翻倍卡',
  cape_unlock: '解锁披风',
  banner: '购买 Banner',
  banner_refund: 'Banner 退款',
  tip_out: '打赏支出',
  tip_in: '收到打赏',
  admin_adjust: '管理员调整',
};

const PAGE_SIZE = 20;

interface TxState {
  items: PointTransactionSummary[];
  total: number;
  page: number;
  loading: boolean;
  error: string | null;
}

export default function TransactionsPanel({
  page,
  refreshKey = 0,
  initialItems,
  initialTotal,
}: {
  page: number;
  /** Bumped by the parent after any balance change so the ledger stays in sync. */
  refreshKey?: number;
  initialItems: PointTransactionSummary[];
  initialTotal: number;
}) {
  const [state, setState] = useState<TxState>({
    items: page === 1 ? initialItems : [],
    total: page === 1 ? initialTotal : 0,
    page,
    loading: true,
    error: null,
  });
  // Seeds page 1 for a fast first paint; the effect always (re)fetches for an
  // accurate `total`, and re-runs whenever the URL `page` or `refreshKey` changes.
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    const token = `${page}:${refreshKey}`;
    if (loadedRef.current === token) {
      setState((s) => ({ ...s, page, loading: false }));
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, page, loading: true, error: null }));
    fetchPointTransactions(page, PAGE_SIZE)
      .then((result) => {
        if (cancelled) {
          return;
        }
        loadedRef.current = token;
        setState({
          items: result.items,
          total: result.total,
          page: result.page,
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setState((s) => ({ ...s, loading: false, error: describeApiError(error) }));
      });

    return () => {
      cancelled = true;
    };
  }, [page, refreshKey]);

  return (
    <section className="card" aria-labelledby="growth-tx-title">
      <div className="panel-head">
        <h2 id="growth-tx-title">积分流水</h2>
        <span className="panel-meta">共 {state.total} 条</span>
      </div>

      {state.error !== null ? (
        <p className="bad growth-error" role="alert">
          {state.error}
        </p>
      ) : state.items.length === 0 && !state.loading ? (
        <p className="growth-section-note">暂无积分流水。</p>
      ) : (
        <div className="growth-table-wrap">
          <table className="growth-table">
            <caption className="sr-only">积分收支明细，按时间倒序分页展示。</caption>
            <thead>
              <tr>
                <th scope="col">时间</th>
                <th scope="col">类型</th>
                <th scope="col" className="num">
                  变动
                </th>
                <th scope="col" className="num">
                  余额
                </th>
                <th scope="col">备注</th>
              </tr>
            </thead>
            <tbody aria-busy={state.loading}>
              {state.items.map((tx) => (
                <tr key={tx.id}>
                  <td>{formatDateTime(tx.createdAt)}</td>
                  <td>{REASON_LABELS[tx.reason] ?? tx.reason}</td>
                  <td className={`num ${tx.amount >= 0 ? 'tx-positive' : 'tx-negative'}`}>
                    {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                  </td>
                  <td className="num">{tx.balanceAfter}</td>
                  <td>{tx.memo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={state.page}
        pageSize={PAGE_SIZE}
        total={state.total}
        buildHref={(target) => `/forum/growth?tx=${target}`}
        label="积分流水分页"
      />
    </section>
  );
}
