'use client';

import { useState } from 'react';
import type {
  GrowthOverviewResponse,
  TitleApplicationSummary,
  UserProgressSummary,
} from '@mcserauth/shared';
import CheckinPanel from './checkin-panel';
import LeaderboardPanel from './leaderboard-panel';
import LevelCard from './level-card';
import ShopPanel from './shop-panel';
import TitlesPanel from './titles-panel';
import TransactionsPanel from './transactions-panel';
import WalletPanel from './wallet-panel';
import './growth.css';

export default function GrowthCenter({
  overview,
  transactionsPage,
}: {
  overview: GrowthOverviewResponse;
  transactionsPage: number;
}) {
  const [progress, setProgress] = useState<UserProgressSummary>(overview.progress);
  const [pending, setPending] = useState<TitleApplicationSummary | null>(
    overview.pendingTitleApplication,
  );
  const [ledgerRevision, setLedgerRevision] = useState(0);

  // Every panel that can move the wallet reports its new progress here; the
  // ledger has to re-fetch because its rows live behind a separate endpoint.
  function handleProgressChange(next: UserProgressSummary): void {
    setProgress(next);
    setLedgerRevision((revision) => revision + 1);
  }

  return (
    <div className="growth-layout">
      <LevelCard progress={progress} />

      <div className="growth-columns">
        <div className="growth-column">
          <CheckinPanel progress={progress} onProgress={handleProgressChange} />
          <WalletPanel progress={progress} />
          <ShopPanel shop={overview.shop} progress={progress} onProgress={handleProgressChange} />
        </div>

        <div className="growth-column">
          <TitlesPanel
            progress={progress}
            titleApplicationLevel={overview.rules.titleApplicationLevel}
            pending={pending}
            onApplied={setPending}
          />
          <LeaderboardPanel entries={overview.leaderboard} />
          <TransactionsPanel
            page={transactionsPage}
            refreshKey={ledgerRevision}
            initialItems={overview.latestTransactions}
            initialTotal={overview.latestTransactions.length}
          />
        </div>
      </div>
    </div>
  );
}
