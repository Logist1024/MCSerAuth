'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { useToast } from './toast';

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard !== undefined && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-9999px';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(area);
  if (!copied) {
    throw new Error('copy-failed');
  }
}

/** Copies a stable forum permalink and confirms the result with a toast. */
export default function CopyLinkButton({
  path,
  label = '链接',
  title = '复制本楼链接',
}: {
  path: string;
  label?: string;
  title?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  async function copy(): Promise<void> {
    try {
      await writeClipboard(new URL(path, window.location.origin).toString());
      setCopied(true);
      toast.success('链接已复制到剪贴板');
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('复制失败，请从地址栏手动复制链接');
    }
  }

  return (
    <button
      className="action-button"
      type="button"
      onClick={() => void copy()}
      title={title}
      aria-label={title}
    >
      <Icon name={copied ? 'check' : 'link'} width={14} height={14} />
      {copied ? '已复制' : label}
    </button>
  );
}
