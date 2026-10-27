'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteForumPost, deleteForumReply } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import ConfirmDialog from './confirm-dialog';
import { Icon } from './icons';
import { useToast } from './toast';

/** Author-only actions (edit is a link, delete asks for inline confirmation). */
export default function OwnerActions({
  kind,
  id,
  editHref,
  redirectTo,
  showDelete = true,
}: {
  kind: 'post' | 'reply';
  id: number;
  editHref?: string;
  redirectTo?: string;
  showDelete?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove(): Promise<void> {
    setBusy(true);
    try {
      if (kind === 'post') {
        await deleteForumPost(id);
        setConfirming(false);
        toast.success('帖子已删除');
        router.push(redirectTo ?? '/forum');
        router.refresh();
      } else {
        await deleteForumReply(id);
        setConfirming(false);
        toast.success('回复已删除');
        router.refresh();
      }
    } catch (deleteError) {
      toast.error(describeApiError(deleteError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {editHref !== undefined ? (
        <Link className="action-button" href={editHref}>
          <Icon name="pencil" width={14} height={14} />
          编辑
        </Link>
      ) : null}
      {showDelete ? (
        <button
          className="action-button danger"
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
        >
          <Icon name="trash" width={14} height={14} />
          删除
        </button>
      ) : null}
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={kind === 'post' ? '删除这个帖子？' : '删除这条回复？'}
        description={
          kind === 'post'
            ? '帖子会从列表中移除，且无法在帖子页恢复。'
            : '这条回复会从楼层中移除，且无法恢复。'
        }
        confirmLabel="确认删除"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
