'use client';

import type { ReportTargetType } from '@mcserauth/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createReport } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { Icon } from './icons';
import { useToast } from './toast';

const TARGET_LABEL: Record<string, string> = {
  post: '帖子',
  reply: '回复',
  user: '用户',
  texture: '纹理',
};

export default function ReportButton({
  targetType,
  targetId,
}: {
  targetType: ReportTargetType;
  targetId: string;
}) {
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  function close(): void {
    if (!busy) {
      setOpen(false);
      setError(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError('请填写至少 5 个字符的举报理由');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createReport({ targetType, targetId, reason: trimmed });
      setReason('');
      setOpen(false);
      toast.success('举报已提交，审核员会尽快处理');
      window.dispatchEvent(new Event('mcserauth:notifications-changed'));
    } catch (reportError) {
      setError(describeApiError(reportError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="action-button"
        type="button"
        onClick={() => setOpen(true)}
        title={`举报该${TARGET_LABEL[targetType] ?? '内容'}`}
        aria-haspopup="dialog"
      >
        <Icon name="flag" width={14} height={14} />
        举报
      </button>

      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby={`report-title-${targetType}-${targetId}`}
        aria-describedby={`report-desc-${targetType}-${targetId}`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === dialog.current) {
            close();
          }
        }}
      >
        <form onSubmit={submit}>
          <div className="dialog-head">
            <span className="dialog-icon">
              <Icon name="flag" />
            </span>
            <div>
              <h2 id={`report-title-${targetType}-${targetId}`}>
                举报{TARGET_LABEL[targetType] ?? '内容'}
              </h2>
              <p className="muted small" id={`report-desc-${targetType}-${targetId}`}>
                请说明具体违规点，例如广告、人身攻击或泄露隐私。恶意举报可能被记录。
              </p>
            </div>
          </div>
          <div className="report-body">
            <div className="field">
              <label htmlFor={`report-reason-${targetType}-${targetId}`}>举报理由</label>
              <textarea
                id={`report-reason-${targetType}-${targetId}`}
                value={reason}
                minLength={5}
                maxLength={500}
                rows={4}
                required
                onChange={(event) => setReason(event.target.value)}
                placeholder="至少 5 个字符，最多 500 个字符"
              />
            </div>
            <p className="report-hint">{reason.trim().length} / 500</p>
            {error !== null ? <p className="bad small">{error}</p> : null}
          </div>
          <div className="dialog-actions">
            <button className="button ghost" type="button" onClick={close} disabled={busy}>
              取消
            </button>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? '提交中…' : '提交举报'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
