'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { updateForumReply } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { Icon } from './icons';
import MarkdownEditor from './markdown-editor';
import { useToast } from './toast';

export const EDIT_REPLY_EVENT = 'mcserauth:edit-reply';

/**
 * Author-only "编辑" trigger. Sits in the reply action row and asks the
 * matching EditReplyBody (below) to swap its rendered Markdown for an editor.
 */
export function EditReplyButton({ replyId }: { replyId: number }) {
  function open(): void {
    window.dispatchEvent(new CustomEvent(EDIT_REPLY_EVENT, { detail: { replyId } }));
  }
  return (
    <button className="action-button" type="button" onClick={open} aria-label="编辑回复">
      <Icon name="pencil" width={14} height={14} />
      编辑
    </button>
  );
}

/**
 * Inline editor for the author's own reply (PATCH /api/forum/replies/:id).
 * `children` is the server-rendered Markdown body shown while closed, so the
 * editor can replace it in place without lifting state into the RSC page.
 */
export function EditReplyBody({
  replyId,
  initialContent,
  children,
}: {
  replyId: number;
  initialContent: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorId = `edit-reply-${replyId}`;

  useEffect(() => {
    const onEdit = (event: Event): void => {
      const detail = (event as CustomEvent<{ replyId: number }>).detail;
      if (detail?.replyId !== replyId) {
        return;
      }
      setContent(initialContent);
      setPreview(false);
      setError(null);
      setEditing(true);
      window.setTimeout(() => {
        const element = document.getElementById(editorId);
        if (element instanceof HTMLTextAreaElement) {
          element.focus();
          const end = element.value.length;
          element.setSelectionRange(end, end);
        }
      }, 140);
    };
    window.addEventListener(EDIT_REPLY_EVENT, onEdit);
    return () => window.removeEventListener(EDIT_REPLY_EVENT, onEdit);
  }, [editorId, initialContent, replyId]);

  async function save(): Promise<void> {
    if (busy) {
      return;
    }
    const trimmed = content.trim();
    if (trimmed === '') {
      setError('回复内容不能为空');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateForumReply(replyId, { contentMd: trimmed });
      setEditing(false);
      toast.success('回复已更新');
      router.refresh();
    } catch (saveError) {
      setError(describeApiError(saveError));
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return <>{children}</>;
  }

  return (
    <form
      className="composer-main"
      aria-busy={busy}
      aria-label="编辑回复"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <MarkdownEditor
        id={editorId}
        label="回复内容"
        value={content}
        onChange={(next) => {
          setContent(next);
          if (error !== null) {
            setError(null);
          }
        }}
        preview={preview}
        onPreviewChange={setPreview}
        placeholder="编辑你的回复。支持 Markdown 与粘贴图片。"
        maxLength={10000}
        disabled={busy}
        compact
        onSubmitShortcut={() => void save()}
      />
      {error !== null ? (
        <p className="composer-error" role="alert">
          <Icon name="alert" width={15} height={15} />
          {error}
        </p>
      ) : null}
      <div className="actions">
        <button className="button primary" type="submit" disabled={busy || content.trim() === ''}>
          {busy ? '保存中…' : '保存修改'}
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          disabled={busy}
        >
          取消
        </button>
      </div>
    </form>
  );
}
