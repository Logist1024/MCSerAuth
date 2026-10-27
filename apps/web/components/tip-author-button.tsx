'use client';

import { GROWTH_RULES } from '@mcserauth/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { tipUser } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { Icon } from './icons';
import { useToast } from './toast';

/**
 * Post-based tip entry: this lives in the forum (per-post), not in the growth
 * center. Opens a dialog where the reader sends points to the post author.
 */
export default function TipAuthorButton({
  beneficiaryId,
  beneficiaryName,
  postTitle,
}: {
  beneficiaryId: string;
  beneficiaryName: string;
  postTitle: string;
}) {
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
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
    const quantity = Number.parseInt(amount, 10);
    if (
      Number.isNaN(quantity) ||
      quantity < GROWTH_RULES.tipMin ||
      quantity > GROWTH_RULES.tipMax
    ) {
      setError(`打赏积分需要在 ${GROWTH_RULES.tipMin}–${GROWTH_RULES.tipMax} 之间`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await tipUser({
        userId: beneficiaryId,
        amount: quantity,
        ...(memo.trim() === '' ? {} : { memo: memo.trim() }),
      });
      setAmount('');
      setMemo('');
      setOpen(false);
      toast.success(`已向 ${beneficiaryName} 打赏 ${quantity} 积分`);
    } catch (tipError) {
      setError(describeApiError(tipError));
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
        title={`打赏 ${beneficiaryName} 的这篇帖子`}
        aria-haspopup="dialog"
      >
        <Icon name="star" width={14} height={14} />
        打赏
      </button>

      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby="tip-title"
        aria-describedby="tip-desc"
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
              <Icon name="star" />
            </span>
            <div>
              <h2 id="tip-title">打赏帖子</h2>
              <p className="muted small" id="tip-desc">
                用积分感谢 {beneficiaryName} 的《{postTitle}》。
              </p>
            </div>
          </div>
          <div className="report-body">
            <div className="field">
              <label htmlFor="tip-amount">积分数量</label>
              <input
                id="tip-amount"
                type="number"
                value={amount}
                min={GROWTH_RULES.tipMin}
                max={GROWTH_RULES.tipMax}
                step={1}
                required
                onChange={(event) => setAmount(event.target.value)}
                placeholder={`花费 ${GROWTH_RULES.tipMin}–${GROWTH_RULES.tipMax} 积分`}
              />
            </div>
            <div className="field">
              <label htmlFor="tip-memo">附言（可选）</label>
              <input
                id="tip-memo"
                value={memo}
                maxLength={60}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="写点什么感谢对方"
              />
            </div>
            {error !== null ? <p className="bad small">{error}</p> : null}
          </div>
          <div className="dialog-actions">
            <button className="button ghost" type="button" onClick={close} disabled={busy}>
              取消
            </button>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? '发送中…' : '确认打赏'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
