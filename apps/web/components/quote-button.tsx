'use client';

import { Icon } from './icons';
import { useToast } from './toast';

export interface QuoteReplyDetail {
  author: string;
  floor: number | null;
  quote: string;
  /** Plain-text preview shown in the composer quote chip. */
  excerpt: string;
}

/** Drops a quoted excerpt into the reply composer at the bottom of the topic. */
export default function QuoteButton({
  author,
  floor,
  content,
  label = '引用',
}: {
  author: string;
  floor?: number | null;
  content: string;
  label?: string;
}) {
  const toast = useToast();

  function quote(): void {
    const trimmed = content.trim();
    const excerptSource = trimmed.length > 600 ? `${trimmed.slice(0, 600)}…` : trimmed;
    const quoted = excerptSource
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    const heading = floor === null || floor === undefined ? '楼主' : `#${floor}`;
    const plainText = excerptSource
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const excerpt =
      plainText.length > 90 ? `${plainText.slice(0, 90)}…` : plainText || '（无文字内容）';
    window.dispatchEvent(
      new CustomEvent<QuoteReplyDetail>('mcserauth:quote-reply', {
        detail: {
          author,
          floor: floor ?? null,
          quote: `> **${author}**（${heading}）\n${quoted}\n\n`,
          excerpt,
        },
      }),
    );
    toast.info(
      floor === null || floor === undefined
        ? `已引用 ${author} 的主题，继续撰写回复`
        : `已引用 #${floor}，继续撰写回复`,
    );
    document.getElementById('reply')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      const editor = document.getElementById('reply-editor');
      if (editor instanceof HTMLTextAreaElement) {
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
      }
    }, 220);
  }

  return (
    <button
      className="action-button"
      type="button"
      onClick={quote}
      title={`引用 ${author}${floor === null || floor === undefined ? ' 的主题' : ` 的 #${floor}`}`}
      aria-label={`引用 ${author}${floor === null || floor === undefined ? ' 的主题' : ` 的 #${floor} 楼`}`}
    >
      <Icon name="quote" width={14} height={14} />
      {label}
    </button>
  );
}
