'use client';

import type { PostStatus, ReplyStatus } from '@mcserauth/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { adminModeratePost, adminModerateReply } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import ConfirmDialog from './confirm-dialog';
import { useToast } from './toast';

export default function AdminPostControls({
  postId,
  status,
  pinned,
  featured,
  locked,
}: {
  postId: number;
  status: PostStatus;
  pinned: boolean;
  featured: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    input: { status?: PostStatus; pinned?: boolean; featured?: boolean; locked?: boolean };
    text: string;
  } | null>(null);

  async function apply(input: {
    status?: PostStatus;
    pinned?: boolean;
    featured?: boolean;
    locked?: boolean;
  }): Promise<void> {
    setBusy(true);
    try {
      await adminModeratePost(postId, input);
      toast.success('帖子状态已更新');
      setPending(null);
      router.refresh();
    } catch (moderationError) {
      toast.error(describeApiError(moderationError));
    } finally {
      setBusy(false);
    }
  }

  function request(
    input: { status?: PostStatus; pinned?: boolean; featured?: boolean; locked?: boolean },
    confirmText?: string,
  ): void {
    if (confirmText !== undefined) {
      setPending({ input, text: confirmText });
      return;
    }
    void apply(input);
  }

  return (
    <>
      <div className="admin-controls">
        <span className="admin-controls-label">管理操作</span>
        <button
          className="button tiny secondary"
          type="button"
          disabled={busy}
          onClick={() => request({ pinned: !pinned })}
        >
          {pinned ? '取消置顶' : '置顶'}
        </button>
        <button
          className="button tiny secondary"
          type="button"
          disabled={busy}
          onClick={() => request({ featured: !featured })}
        >
          {featured ? '取消精华' : '设为精华'}
        </button>
        <button
          className="button tiny secondary"
          type="button"
          disabled={busy}
          onClick={() => request({ locked: !locked })}
        >
          {locked ? '解锁' : '锁定'}
        </button>
        {status === 'published' ? (
          <button
            className="button tiny secondary"
            type="button"
            disabled={busy}
            onClick={() => request({ status: 'hidden' })}
          >
            隐藏
          </button>
        ) : status !== 'deleted' ? (
          <button
            className="button tiny secondary"
            type="button"
            disabled={busy}
            onClick={() => request({ status: 'published' })}
          >
            恢复
          </button>
        ) : null}
        {status !== 'deleted' ? (
          <button
            className="button tiny danger"
            type="button"
            disabled={busy}
            onClick={() => request({ status: 'deleted' }, '删除后帖子将从论坛移除，确定继续？')}
          >
            删除
          </button>
        ) : null}
      </div>
      <ConfirmDialog
        open={pending !== null}
        tone="danger"
        title="删除这个帖子？"
        description={pending?.text}
        confirmLabel="确认删除"
        busy={busy}
        onConfirm={() => {
          if (pending !== null) {
            void apply(pending.input);
          }
        }}
        onCancel={() => setPending(null)}
      />
    </>
  );
}

export function AdminReplyControls({ replyId, status }: { replyId: number; status: ReplyStatus }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function apply(next: ReplyStatus): Promise<void> {
    setBusy(true);
    try {
      await adminModerateReply(replyId, { status: next });
      toast.success('回复状态已更新');
      setConfirming(false);
      router.refresh();
    } catch (moderationError) {
      toast.error(describeApiError(moderationError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span className="admin-controls inline">
        {status === 'published' ? (
          <button
            className="action-button"
            type="button"
            disabled={busy}
            onClick={() => void apply('hidden')}
          >
            隐藏
          </button>
        ) : null}
        {status === 'hidden' ? (
          <button
            className="action-button"
            type="button"
            disabled={busy}
            onClick={() => void apply('published')}
          >
            恢复
          </button>
        ) : null}
        <button
          className="action-button danger"
          type="button"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          删除
        </button>
      </span>
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title="删除这条回复？"
        description="回复会从楼层中移除，且无法恢复。"
        confirmLabel="确认删除"
        busy={busy}
        onConfirm={() => void apply('deleted')}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
