'use client';

import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { uploadForumImage } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { Icon } from './icons';
import Markdown from './markdown';
import { useToast } from './toast';

interface MarkdownEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  preview: boolean;
  onPreviewChange: (preview: boolean) => void;
  placeholder?: string;
  maxLength?: number;
  label?: string;
  onSubmitShortcut?: () => void;
  disabled?: boolean;
  /** Compact height for inline reply composers. */
  compact?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}

export default function MarkdownEditor({
  id,
  value,
  onChange,
  preview,
  onPreviewChange,
  placeholder = '支持 Markdown、代码块与图片；可直接粘贴或拖入图片。',
  maxLength = 20000,
  label = '正文',
  onSubmitShortcut,
  disabled = false,
  compact = false,
  onUploadingChange,
}: MarkdownEditorProps) {
  const toast = useToast();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  function focusSelection(start: number, end: number): void {
    requestAnimationFrame(() => {
      const element = textarea.current;
      if (element === null) {
        return;
      }
      onPreviewChange(false);
      element.focus();
      element.setSelectionRange(start, end);
    });
  }

  function applyChange(next: string, selectionStart: number, selectionEnd: number): void {
    if (next.length > maxLength) {
      toast.error(`内容超出 ${maxLength} 字符限制`);
      return;
    }
    onChange(next);
    focusSelection(selectionStart, selectionEnd);
  }

  function wrapSelection(prefix: string, suffix: string, placeholderText: string): void {
    const element = textarea.current;
    if (element === null) {
      return;
    }
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = value.slice(start, end) || placeholderText;
    const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    applyChange(next, start + prefix.length, start + prefix.length + selected.length);
  }

  function prefixLines(prefix: string): void {
    const element = textarea.current;
    if (element === null) {
      return;
    }
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextBreak = value.indexOf('\n', end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const block = value.slice(lineStart, lineEnd);
    const nextBlock = block
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');
    const next = `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`;
    applyChange(next, lineStart, lineStart + nextBlock.length);
  }

  function insertText(text: string): void {
    const element = textarea.current;
    if (element === null) {
      return;
    }
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const leading =
      before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const trailing =
      after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    const insertion = `${leading}${text}${trailing}`;
    const next = `${before}${insertion}${after}`;
    const cursorStart = start + leading.length;
    applyChange(next, cursorStart, cursorStart + text.length);
  }

  function insertLink(): void {
    const element = textarea.current;
    if (element === null) {
      return;
    }
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = value.slice(start, end) || '链接文字';
    const prefix = `[${selected}](`;
    const url = 'https://';
    const next = `${value.slice(0, start)}${prefix}${url})${value.slice(end)}`;
    const urlStart = start + prefix.length;
    applyChange(next, urlStart, urlStart + url.length);
  }

  function insertCode(): void {
    const element = textarea.current;
    if (element === null) {
      return;
    }
    const selected = value.slice(element.selectionStart, element.selectionEnd);
    if (selected.includes('\n')) {
      wrapSelection('```\n', '\n```', '代码');
    } else {
      wrapSelection('`', '`', '代码');
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key === 'Enter') {
      event.preventDefault();
      onSubmitShortcut?.();
      return;
    }
    if (!modifier) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      wrapSelection('**', '**', '粗体');
    } else if (key === 'i') {
      event.preventDefault();
      wrapSelection('*', '*', '斜体');
    } else if (key === 'k') {
      event.preventDefault();
      insertLink();
    }
  }

  async function upload(file: File | null): Promise<void> {
    if (file === null) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('只能上传图片文件');
      return;
    }
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const result = await uploadForumImage(file);
      insertText(result.markdown);
      onPreviewChange(false);
      toast.success('图片已插入正文');
    } catch (error) {
      toast.error(describeApiError(error));
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    const file = [...event.clipboardData.files].find((item) => item.type.startsWith('image/'));
    if (file !== undefined) {
      event.preventDefault();
      void upload(file);
    }
  }

  function handleDrop(event: DragEvent<HTMLTextAreaElement>): void {
    setDragging(false);
    const file = [...event.dataTransfer.files].find((item) => item.type.startsWith('image/'));
    if (file !== undefined) {
      event.preventDefault();
      void upload(file);
    }
  }

  function handleDragOver(event: DragEvent<HTMLTextAreaElement>): void {
    if (![...event.dataTransfer.items].some((item) => item.kind === 'file')) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!dragging) {
      setDragging(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLTextAreaElement>): void {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDragging(false);
  }

  function handleTabKey(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const next = !preview;
    onPreviewChange(next);
    requestAnimationFrame(() => {
      document.getElementById(`${id}-tab-${next ? 'preview' : 'write'}`)?.focus();
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    void upload(event.target.files?.[0] ?? null);
    event.target.value = '';
  }

  const tools: { label: string; icon: Parameters<typeof Icon>[0]['name']; action: () => void }[] = [
    { label: '标题', icon: 'heading', action: () => prefixLines('## ') },
    { label: '粗体（Ctrl+B）', icon: 'bold', action: () => wrapSelection('**', '**', '粗体') },
    { label: '斜体（Ctrl+I）', icon: 'italic', action: () => wrapSelection('*', '*', '斜体') },
    { label: '引用', icon: 'quote', action: () => prefixLines('> ') },
    { label: '代码', icon: 'code', action: insertCode },
    { label: '列表', icon: 'list', action: () => prefixLines('- ') },
    { label: '链接（Ctrl+K）', icon: 'link', action: insertLink },
  ];

  return (
    <div className={`editor${compact ? ' editor-compact' : ''}${dragging ? ' is-dragging' : ''}`}>
      <div className="editor-toolbar">
        <div className="editor-tabs" role="tablist" aria-label="编辑模式" onKeyDown={handleTabKey}>
          <button
            className={`editor-tab${preview ? '' : ' active'}`}
            type="button"
            role="tab"
            id={`${id}-tab-write`}
            aria-selected={!preview}
            aria-controls={`${id}-panel-write`}
            tabIndex={preview ? -1 : 0}
            onClick={() => onPreviewChange(false)}
          >
            编写
          </button>
          <button
            className={`editor-tab${preview ? ' active' : ''}`}
            type="button"
            role="tab"
            id={`${id}-tab-preview`}
            aria-selected={preview}
            aria-controls={`${id}-panel-preview`}
            tabIndex={preview ? 0 : -1}
            onClick={() => onPreviewChange(true)}
          >
            预览
          </button>
        </div>

        <div className="editor-tools" role="toolbar" aria-label="Markdown 工具">
          {tools.map((tool) => (
            <button
              className="editor-tool"
              key={tool.label}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              onClick={tool.action}
              disabled={disabled || preview}
            >
              <Icon name={tool.icon} width={16} height={16} />
            </button>
          ))}
          <span className="editor-tool-separator" aria-hidden="true" />
          <button
            className="editor-tool"
            type="button"
            title="上传图片"
            aria-label="上传图片"
            aria-busy={uploading}
            onClick={() => fileInput.current?.click()}
            disabled={disabled || uploading || preview}
          >
            <Icon name="image" width={16} height={16} />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleFileChange}
            hidden
          />
        </div>
      </div>

      <div
        className="editor-write"
        id={`${id}-panel-write`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-write`}
        hidden={preview}
      >
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
        <textarea
          className="editor-textarea"
          id={id}
          ref={textarea}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-describedby={`${id}-status`}
          disabled={disabled}
        />
      </div>

      <div
        className="editor-preview markdown"
        id={`${id}-panel-preview`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-preview`}
        hidden={!preview}
      >
        {value.trim() === '' ? (
          <p className="muted">还没有内容可预览。</p>
        ) : (
          <Markdown content={value} />
        )}
      </div>

      <div className="editor-status" id={`${id}-status`}>
        <span>
          {uploading ? (
            <span className="editor-upload" role="status">
              正在上传图片…
            </span>
          ) : dragging ? (
            <span className="editor-drop-hint">松开鼠标即可上传图片</span>
          ) : (
            '支持 Markdown · 可粘贴或拖入图片 · Ctrl/⌘+Enter 提交'
          )}
        </span>
        <span
          className={value.length > maxLength * 0.9 ? 'editor-count near-limit' : 'editor-count'}
        >
          {value.length} / {maxLength}
        </span>
      </div>
    </div>
  );
}
