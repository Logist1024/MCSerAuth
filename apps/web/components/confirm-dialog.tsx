'use client';

import { useEffect, useId, useRef } from 'react';
import { Icon } from './icons';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

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

  return (
    <dialog
      ref={dialog}
      className="dialog confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={description !== undefined ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          onCancel();
        }
      }}
      onClick={(event) => {
        if (event.target === dialog.current && !busy) {
          onCancel();
        }
      }}
    >
      <div className="dialog-head">
        <span className={`dialog-icon${tone === 'danger' ? ' danger' : ''}`}>
          <Icon name={tone === 'danger' ? 'alert' : 'message'} />
        </span>
        <div>
          <h2 id={titleId}>{title}</h2>
          {description !== undefined ? (
            <p className="muted small" id={descriptionId}>
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="dialog-actions">
        <button className="button ghost" type="button" onClick={onCancel} disabled={busy} autoFocus>
          {cancelLabel}
        </button>
        <button
          className={`button${tone === 'danger' ? ' danger-solid' : ' primary'}`}
          type="button"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? '处理中…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
