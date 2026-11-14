'use client';

import { useState } from 'react';
import { Icon } from './icons';

/** Copies a raw value (UUID, server address…) on click; shows a check on success. */
export default function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      // Clipboard API unavailable (insecure context); fall back to showing the raw value.
    }
  }

  return (
    <button
      className="copy-button mono tiny-text"
      type="button"
      title={`点击复制：${value}`}
      onClick={() => void copy()}
    >
      <span>{label ?? value}</span>
      <Icon name={copied ? 'check' : 'link'} width={12} height={12} />
    </button>
  );
}
