'use client';

import { useState } from 'react';
import type { UserProgressSummary } from '@mcserauth/shared';
import { checkinToday } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { Icon } from '@/components/icons';
import Spinner from '@/components/spinner';
import { useToast } from '@/components/toast';

export default function CheckinPanel({
  progress,
  onProgress,
}: {
  progress: UserProgressSummary;
  onProgress: (next: UserProgressSummary) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const done = progress.checkedInToday;

  async function handleCheckin(): Promise<void> {
    if (busy || done) {
      return;
    }
    setBusy(true);
    try {
      const result = await checkinToday();
      onProgress(result.progress);
      toast.success(
        `签到成功，+${result.xpAwarded} 经验、+${result.pointsAwarded} 积分，已连续 ${result.streak} 天。`,
      );
    } catch (error) {
      toast.error(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="growth-checkin-title">
      <div className="panel-head">
        <h2 id="growth-checkin-title">每日签到</h2>
        <span className="panel-meta">连续 {progress.checkinStreak} 天</span>
      </div>
      <div className="checkin-row">
        <button
          className="button primary"
          type="button"
          onClick={() => void handleCheckin()}
          disabled={done || busy}
          aria-busy={busy}
        >
          {busy ? <Spinner /> : <Icon name="check" width={16} height={16} />}
          {done ? `今日已签到，连续 ${progress.checkinStreak} 天` : busy ? '签到中…' : '每日签到'}
        </button>
      </div>
      <p className="checkin-hint">
        {done ? '明天再来，连续签到奖励更多。' : '签到可获得经验与积分。'}
      </p>
    </section>
  );
}
