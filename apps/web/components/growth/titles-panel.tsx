'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type {
  TitleApplicationSummary,
  UserProgressSummary,
} from '@mcserauth/shared';
import { submitTitleApplication } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { Icon } from '@/components/icons';
import Spinner from '@/components/spinner';
import { useToast } from '@/components/toast';
import { TitleBadge } from './user-badges';

export default function TitlesPanel({
  progress,
  titleApplicationLevel,
  pending,
  onApplied,
}: {
  progress: UserProgressSummary;
  titleApplicationLevel: number;
  pending: TitleApplicationSummary | null;
  onApplied: (application: TitleApplicationSummary) => void;
}) {
  const toast = useToast();
  const [proposedName, setProposedName] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const canApply = !progress.levelExempt && progress.level >= titleApplicationLevel;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const name = proposedName.trim();
    const why = reason.trim();
    if (name === '' || why === '') {
      toast.error('请填写称号名称与申请理由。');
      return;
    }
    setBusy(true);
    try {
      const result = await submitTitleApplication({ proposedName: name, reason: why });
      onApplied(result);
      setProposedName('');
      setReason('');
      toast.success('专属称号申请已提交，等待管理员审核。');
    } catch (error) {
      toast.error(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="growth-titles-title">
      <div className="panel-head">
        <h2 id="growth-titles-title">称号</h2>
      </div>

      {progress.levelExempt ? (
        <p className="pending-note">
          <Icon name="shield" width={13} height={13} />
          特别称号不参与等级排行。
        </p>
      ) : null}

      <div className="stack">
        <span className="status-label">我的称号</span>
        {progress.title !== null ? (
          <div className="title-catalog">
            <TitleBadge name={progress.title.name} color={progress.title.color} size="lg" />
          </div>
        ) : (
          <p className="growth-section-note">暂未持有称号。</p>
        )}
      </div>

      {pending !== null && pending.status === 'pending' ? (
        <p className="pending-note">
          <Icon name="clock" width={13} height={13} />
          专属称号「{pending.proposedName}」审核中。
        </p>
      ) : null}

      {canApply && pending === null ? (
        <form className="growth-form" onSubmit={submit}>
          <p className="growth-section-note">
            你已达到 {titleApplicationLevel} 级，可申请专属称号。
          </p>
          <div className="field">
            <label htmlFor="title-name">称号名称 *</label>
            <input
              id="title-name"
              value={proposedName}
              maxLength={24}
              onChange={(e) => setProposedName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="title-reason">申请理由 *</label>
            <textarea
              id="title-reason"
              value={reason}
              rows={3}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <div className="actions">
            <button className="button primary small" type="submit" disabled={busy} aria-busy={busy}>
              {busy ? <Spinner /> : <Icon name="star" width={15} height={15} />}
              {busy ? '提交中…' : '提交申请'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
