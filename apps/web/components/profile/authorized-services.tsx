'use client';

import { useCallback, useEffect, useState } from 'react';
import { OAUTH_SCOPE_LABELS, type UserAuthorizationView } from '@mcserauth/shared';
import { fetchMyAuthorizations, revokeAuthorization } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { formatDate } from '@/lib/format';

/**
 * Owner-only panel listing the sibling services this account has remembered
 * grants for ("记住授权"). Revoking removes the grant and instantly kills the
 * tokens that service holds.
 */
export default function AuthorizedServices() {
  const [items, setItems] = useState<UserAuthorizationView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const result = await fetchMyAuthorizations();
      setItems(result.items);
    } catch (apiError) {
      setError(describeApiError(apiError));
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function revoke(clientId: string): Promise<void> {
    setRevoking(clientId);
    setError(null);
    try {
      await revokeAuthorization(clientId);
      await reload();
    } catch (apiError) {
      setError(describeApiError(apiError));
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section className="side-card">
      <div className="section-heading">
        <h2>已授权服务</h2>
      </div>
      <p className="muted small">这些服务可以使用你的账号免确认登录；撤销后其令牌立即失效。</p>
      {error !== null ? (
        <p className="bad small" role="alert">
          {error}
        </p>
      ) : null}
      {items === null ? (
        <p className="muted small">加载中…</p>
      ) : items.length === 0 ? (
        <p className="muted small">还没有授权过任何服务。</p>
      ) : (
        <ul className="stack">
          {items.map((item) => (
            <li key={item.clientId} className="authorized-service">
              <div>
                <strong>{item.clientName}</strong>
                <span className="muted small"> · {formatDate(item.grantedAt)} 授权</span>
                <div className="muted small">
                  {item.scopes.map((scope) => OAUTH_SCOPE_LABELS[scope] ?? scope).join('、')}
                </div>
              </div>
              <button
                className="button tiny secondary"
                type="button"
                disabled={revoking !== null}
                onClick={() => void revoke(item.clientId)}
              >
                {revoking === item.clientId ? '撤销中…' : '撤销授权'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
