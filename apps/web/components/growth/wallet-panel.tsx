import type { UserProgressSummary } from '@mcserauth/shared';
import { formatDateTime } from '@/lib/format';
import { Icon } from '@/components/icons';

export default function WalletPanel({ progress }: { progress: UserProgressSummary }) {
  return (
    <section className="card" aria-labelledby="growth-wallet-title">
      <div className="panel-head">
        <h2 id="growth-wallet-title">积分</h2>
        <span className="panel-meta">商店 / 打赏 / Banner</span>
      </div>
      <div className="wallet-grid">
        <div className="stat-card">
          <span className="stat-label">当前积分</span>
          <strong className="stat-value">{progress.points}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">累计签到</span>
          <strong className="stat-value">{progress.totalCheckins}</strong>
        </div>
      </div>
      {progress.xpBoostActive && progress.xpBoostUntil !== null ? (
        <p className="boost-flag">
          <Icon name="star" width={13} height={13} />
          经验翻倍生效中，至 {formatDateTime(progress.xpBoostUntil)}
        </p>
      ) : null}
    </section>
  );
}
