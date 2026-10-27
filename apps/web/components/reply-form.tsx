'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createForumReply } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import Avatar from './avatar';
import { Icon } from './icons';
import MarkdownEditor from './markdown-editor';
import type { QuoteReplyDetail } from './quote-button';
import Spinner from './spinner';
import { useToast } from './toast';

interface QuoteTarget {
  author: string;
  floor: number | null;
  quote: string;
  excerpt: string;
}

const DRAFT_PREFIX = 'mcserauth:reply-draft:';

function draftKey(postId: number): string {
  return `${DRAFT_PREFIX}${postId}`;
}

function readDraft(postId: number): string {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    return window.sessionStorage.getItem(draftKey(postId)) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(postId: number, content: string): void {
  try {
    window.sessionStorage.setItem(draftKey(postId), content);
  } catch {
    // Storage may be unavailable (private mode or quota); drafts are best-effort.
  }
}

function clearDraftStorage(postId: number): void {
  try {
    window.sessionStorage.removeItem(draftKey(postId));
  } catch {
    // Ignore unavailable storage.
  }
}

/** Focuses the reply textarea and places the caret at the end. */
function focusEditor(): void {
  window.setTimeout(() => {
    const element = document.getElementById('reply-editor');
    if (!(element instanceof HTMLTextAreaElement)) {
      return;
    }
    element.focus();
    const end = element.value.length;
    element.setSelectionRange(end, end);
  }, 140);
}

/** Scrolls to the freshly rendered reply once the RSC refresh has landed. */
function revealReply(replyId: number): void {
  let attempts = 0;
  const tick = (): void => {
    const element = document.getElementById(`reply-${replyId}`);
    if (element !== null) {
      element.classList.add('is-new');
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => element.classList.remove('is-new'), 2600);
      return;
    }
    attempts += 1;
    if (attempts < 8) {
      window.setTimeout(tick, 250);
    }
  };
  window.setTimeout(tick, 250);
}

export default function ReplyForm({
  postId,
  viewerName,
  viewerAvatarUrl,
  replyCount = 0,
  replyPageSize = 20,
}: {
  postId: number;
  viewerName: string;
  viewerAvatarUrl: string | null;
  replyCount?: number;
  replyPageSize?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<QuoteTarget | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const stored = readDraft(postId);
    if (stored.trim() !== '') {
      setContent((current) => (current === '' ? stored : current));
      setDraftRestored(true);
    }
    setHydrated(true);
  }, [postId]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (content.trim() === '') {
        clearDraftStorage(postId);
      } else {
        writeDraft(postId, content);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [content, hydrated, postId]);

  useEffect(() => {
    const onQuote = (event: Event): void => {
      const detail = (event as CustomEvent<QuoteReplyDetail>).detail;
      if (detail === undefined) {
        return;
      }
      setContent((current) => {
        if (current.trim() === '') {
          return detail.quote;
        }
        return `${current.replace(/\s+$/, '')}\n\n${detail.quote}`;
      });
      setQuoteTarget({
        author: detail.author,
        floor: detail.floor,
        quote: detail.quote,
        excerpt: detail.excerpt,
      });
      setPreview(false);
      setDraftRestored(false);
      setError(null);
      focusEditor();
    };
    window.addEventListener('mcserauth:quote-reply', onQuote);
    return () => window.removeEventListener('mcserauth:quote-reply', onQuote);
  }, []);

  function updateContent(next: string): void {
    setContent(next);
    setDraftRestored(false);
    if (error !== null) {
      setError(null);
    }
  }

  function cancelQuote(): void {
    if (quoteTarget !== null) {
      const marker = quoteTarget.quote.trimEnd();
      setContent((current) => {
        const index = marker === '' ? -1 : current.indexOf(marker);
        if (index === -1) {
          return current;
        }
        const next = `${current.slice(0, index)}${current.slice(index + marker.length)}`;
        return next.replace(/\n{3,}/g, '\n\n').trimEnd();
      });
    }
    setQuoteTarget(null);
    setError(null);
    focusEditor();
  }

  function discardDraft(): void {
    setContent('');
    clearDraftStorage(postId);
    setDraftRestored(false);
    setError(null);
    focusEditor();
  }

  async function publish(): Promise<void> {
    if (busy || uploading) {
      return;
    }
    const trimmed = content.trim();
    if (trimmed === '') {
      setError('回复内容不能为空');
      setAnnouncement('回复内容不能为空');
      focusEditor();
      return;
    }

    setBusy(true);
    setError(null);
    setAnnouncement('正在发布回复…');
    try {
      const reply = await createForumReply(postId, trimmed);
      setContent('');
      setPreview(false);
      setQuoteTarget(null);
      setDraftRestored(false);
      clearDraftStorage(postId);
      setAnnouncement('回复已发布');
      toast.success('回复已发布');
      const lastPage = Math.max(1, Math.ceil((replyCount + 1) / Math.max(1, replyPageSize)));
      router.push(`/forum/post/${postId}?replyPage=${lastPage}#reply-${reply.id}`);
      revealReply(reply.id);
    } catch (replyError) {
      const message = describeApiError(replyError);
      setError(message);
      setAnnouncement('回复发布失败');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void publish();
  }

  return (
    <form
      className="composer-main reply-composer"
      onSubmit={submit}
      aria-busy={busy}
      aria-label="回复主题"
    >
      <div className="reply-context">
        <Avatar name={viewerName} src={viewerAvatarUrl} size="sm" />
        <div className="reply-context-copy">
          <strong>以 {viewerName} 的身份回复</strong>
          <span>
            {replyCount > 0 ? `已有 ${replyCount} 条回复，继续参与讨论` : '还没有回复，来抢沙发'}
          </span>
        </div>
      </div>

      {quoteTarget !== null ? (
        <div className="quote-chip" role="note" aria-label={`正在引用 ${quoteTarget.author}`}>
          <Icon name="quote" width={14} height={14} />
          <div className="quote-chip-body">
            <span className="quote-chip-title">
              正在引用 @{quoteTarget.author}
              {quoteTarget.floor !== null ? ` 的 #${quoteTarget.floor}` : ' 的主题'}
            </span>
            <span className="quote-chip-excerpt">{quoteTarget.excerpt}</span>
          </div>
          <button
            className="action-button"
            type="button"
            onClick={cancelQuote}
            aria-label="取消引用"
          >
            <Icon name="x" width={13} height={13} />
            取消引用
          </button>
        </div>
      ) : null}

      {draftRestored ? (
        <div className="draft-chip" role="status">
          <Icon name="clock" width={14} height={14} />
          <span className="draft-chip-text">已恢复上次未发送的草稿</span>
          <button className="action-button" type="button" onClick={discardDraft}>
            清空草稿
          </button>
        </div>
      ) : null}

      <MarkdownEditor
        id="reply-editor"
        label="回复内容"
        value={content}
        onChange={updateContent}
        preview={preview}
        onPreviewChange={setPreview}
        placeholder="写下你的回复。支持 Markdown、@提及 与粘贴图片；Ctrl/⌘+Enter 发布。"
        maxLength={10000}
        disabled={busy}
        compact
        onUploadingChange={setUploading}
        onSubmitShortcut={() => void publish()}
      />

      {error !== null ? (
        <p className="composer-error" role="alert">
          <Icon name="alert" width={15} height={15} />
          {error}
        </p>
      ) : null}

      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      <div className="composer-footer">
        <span className="composer-hint">
          {uploading
            ? '图片上传中，完成后即可发布。'
            : '友善交流，避免剧透与人身攻击。草稿会自动保存在本机。'}
        </span>
        <div className="actions">
          <button
            className="button primary"
            type="submit"
            disabled={busy || uploading || content.trim() === ''}
          >
            {busy ? (
              <>
                <Spinner />
                发布中…
              </>
            ) : (
              <>
                <Icon name="reply" width={15} height={15} />
                发布回复
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
