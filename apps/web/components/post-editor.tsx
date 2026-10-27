'use client';

import type { ForumCategory, ForumPostDetail } from '@mcserauth/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { createForumPost, updateForumPost } from '@/lib/api-client';
import { flattenCategories } from '@/lib/categories';
import { describeApiError } from '@/lib/errors';
import ConfirmDialog from './confirm-dialog';
import { Icon } from './icons';
import MarkdownEditor from './markdown-editor';
import Spinner from './spinner';
import { useToast } from './toast';

export default function PostEditor({
  categories,
  post,
  initialCategoryId,
  cancelHref,
}: {
  categories: ForumCategory[];
  post?: ForumPostDetail;
  initialCategoryId?: number;
  cancelHref?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const options = flattenCategories(categories);
  const [categoryId, setCategoryId] = useState<number>(
    post?.category.id ?? initialCategoryId ?? options[0]?.id ?? 0,
  );
  const [title, setTitle] = useState(post?.title ?? '');
  const [content, setContent] = useState(post?.contentMd ?? '');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const initialTitle = post?.title ?? '';
  const initialContent = post?.contentMd ?? '';
  const draftKey = post ? `mcserauth:post-draft:${post.id}` : 'mcserauth:post-draft:new';
  const dirty = title !== initialTitle || content !== initialContent;
  const selectedCategory = options.find((option) => option.id === categoryId)?.category ?? null;
  const fallbackHref = post ? `/forum/post/${post.id}` : '/forum';

  useEffect(() => {
    if (!dirty || busy) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, busy]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as { title?: string; content?: string };
        if ((parsed.title ?? '') !== '' || (parsed.content ?? '') !== '') {
          setTitle((current) => (current === initialTitle ? (parsed.title ?? current) : current));
          setContent((current) =>
            current === initialContent ? (parsed.content ?? current) : current,
          );
          setDraftRestored(true);
        }
      }
    } catch {
      // Drafts are best-effort; corrupted storage must not block the editor.
    }
    setHydrated(true);
  }, [draftKey, initialTitle, initialContent]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (!dirty || (title.trim() === '' && content.trim() === '')) {
        window.localStorage.removeItem(draftKey);
        return;
      }
      try {
        window.localStorage.setItem(draftKey, JSON.stringify({ title, content }));
      } catch {
        // Private mode/quota: keep editing without autosave.
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [title, content, draftKey, hydrated, dirty]);

  function discardDraft(): void {
    setTitle('');
    setContent('');
    setDraftRestored(false);
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // Ignore unavailable storage.
    }
  }

  async function publish(): Promise<void> {
    if (title.trim().length < 3) {
      setError('标题至少需要 3 个字符');
      return;
    }
    if (content.trim() === '') {
      setError('正文不能为空');
      return;
    }
    if (categoryId === 0) {
      setError('请选择版块');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = post
        ? await updateForumPost(post.id, { title: title.trim(), contentMd: content })
        : await createForumPost({ categoryId, title: title.trim(), contentMd: content });
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // Ignore unavailable storage.
      }
      toast.success(post ? '修改已保存' : '主题已发布');
      router.push(`/forum/post/${result.id}`);
      router.refresh();
    } catch (submitError) {
      setError(describeApiError(submitError));
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void publish();
  }

  function requestCancel(): void {
    if (dirty) {
      setDiscard(true);
      return;
    }
    router.push(cancelHref ?? fallbackHref);
  }

  return (
    <>
      <form className="composer-layout" onSubmit={submit} aria-busy={busy}>
        <div className="composer-main">
          <div className="composer-head">
            <div className="composer-category-row">
              <label htmlFor="post-category">版块</label>
              <select
                id="post-category"
                value={categoryId}
                disabled={post !== undefined}
                onChange={(event) => setCategoryId(Number(event.target.value))}
                required
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {`${'　'.repeat(option.depth)}${option.name}`}
                  </option>
                ))}
              </select>
              {post !== undefined ? (
                <span className="muted tiny-text">编辑时不能移动版块</span>
              ) : null}
              <span
                className={
                  title.length > 90 ? 'composer-title-count near-limit' : 'composer-title-count'
                }
              >
                {title.length} / 100
              </span>
            </div>
            <input
              className="composer-title-input"
              id="post-title"
              value={title}
              minLength={3}
              maxLength={100}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="标题：一句话说清楚你想讨论什么"
              aria-label="标题"
              autoFocus={post === undefined}
              required
            />
          </div>

          {draftRestored ? (
            <div className="draft-chip" role="status">
              <Icon name="clock" width={14} height={14} />
              <span className="draft-chip-text">已恢复上次未发布的草稿</span>
              <button className="action-button" type="button" onClick={discardDraft}>
                清空草稿
              </button>
            </div>
          ) : null}

          <MarkdownEditor
            id="post-content"
            label="正文"
            value={content}
            onChange={setContent}
            preview={preview}
            onPreviewChange={setPreview}
            placeholder="支持 Markdown、代码块与图片。可以直接粘贴或拖入截图，图片会自动上传并插入光标位置。"
            maxLength={20000}
            disabled={busy}
            onSubmitShortcut={() => void publish()}
          />

          {error !== null ? (
            <p className="composer-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="composer-footer">
            <span className="composer-hint">
              {post ? '保存后立即更新帖子内容。' : '发布后仍可继续编辑主题。'}
            </span>
            <div className="actions">
              <button
                className="button ghost"
                type="button"
                onClick={requestCancel}
                disabled={busy}
              >
                取消
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={busy || options.length === 0}
              >
                {busy ? (
                  <>
                    <Spinner />
                    提交中…
                  </>
                ) : post ? (
                  '保存修改'
                ) : (
                  '发布主题'
                )}
              </button>
            </div>
          </div>
        </div>

        <aside className="composer-side">
          <section className="side-card">
            <h2>发布检查</h2>
            <ul className="side-note">
              <li>标题具体到问题或内容，避免“求助”“问一下”这类空标题。</li>
              <li>贴上报错、配置或截图；代码请用代码块包裹。</li>
              <li>选择最匹配的版块，方便其他人找到它。</li>
            </ul>
          </section>

          {selectedCategory !== null ? (
            <section className="side-card">
              <h2>{selectedCategory.name}</h2>
              <p className="side-note">{selectedCategory.description ?? '这个版块还没有简介。'}</p>
            </section>
          ) : null}

          {options.length === 0 ? <p className="bad small">尚未配置版块，请联系管理员。</p> : null}
        </aside>
      </form>

      <ConfirmDialog
        open={discard}
        title="放弃未保存的内容？"
        description="离开当前页面后，刚刚输入的内容将不会保留。"
        confirmLabel="放弃并离开"
        tone="danger"
        onConfirm={() => {
          setDiscard(false);
          try {
            window.localStorage.removeItem(draftKey);
          } catch {
            // Ignore unavailable storage.
          }
          router.push(cancelHref ?? fallbackHref);
        }}
        onCancel={() => setDiscard(false)}
      />
    </>
  );
}
