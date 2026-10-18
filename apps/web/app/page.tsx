import type { HealthData } from '@mcserauth/shared';
import { API_BASE_URL, fetchHealth } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let health: HealthData | undefined;
  let errorMessage: string | undefined;

  try {
    health = await fetchHealth();
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  return (
    <section className="card">
      <h1>服务连通性自检</h1>
      <p className="muted">
        本页直接调用服务端 <code>GET /health</code>（统一封装 <code>{'{ code, data }'}</code>
        ），用于验证 web 与 server 的开发链路。
      </p>

      {health !== undefined ? (
        <div>
          <div className="status-row">
            <span className="status-label">整体状态</span>
            <span className={`status-value ${health.status === 'ok' ? 'ok' : 'bad'}`}>
              {health.status}
            </span>
          </div>
          <div className="status-row">
            <span className="status-label">版本</span>
            <span className="status-value">{health.version}</span>
          </div>
          <div className="status-row">
            <span className="status-label">运行时长</span>
            <span className="status-value">{health.uptimeSeconds} s</span>
          </div>
          <div className="status-row">
            <span className="status-label">SQLite</span>
            <span className={`status-value ${health.checks.database === 'up' ? 'ok' : 'bad'}`}>
              {health.checks.database}
            </span>
          </div>
        </div>
      ) : (
        <div>
          <p className="bad">服务端不可达：{errorMessage}</p>
          <p className="muted">
            请确认 API 服务已启动（<code>pnpm dev</code> 或在 <code>apps/server</code> 下运行{' '}
            <code>pnpm start</code>），当前地址为 <code>{API_BASE_URL}</code>。如需修改， 请复制{' '}
            <code>apps/web/.env.example</code> 为 <code>.env.local</code> 并设置{' '}
            <code>NEXT_PUBLIC_API_BASE_URL</code>。
          </p>
        </div>
      )}

      <p className="muted">
        API 基地址：<code>{API_BASE_URL}</code>
      </p>
    </section>
  );
}
