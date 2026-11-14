'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

/**
 * Legacy fallback for insecure contexts where the async Clipboard API is
 * unavailable; returns whether the copy actually happened.
 */
function copyViaExecCommand(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let copied: boolean;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  document.body.removeChild(textarea);
  return copied;
}

/** Copies a raw value (UUID, server address…) on click; shows a check on success. */
export default function CopyButton({ value, label }: { value: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  function mark(settled: 'copied' | 'failed'): void {
    setState(settled);
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current);
    }
    resetTimer.current = window.setTimeout(() => {
      setState('idle');
    }, 1500);
  }

  async function copy(): Promise<void> {
    try {
      if (navigator.clipboard === undefined) {
        mark(copyViaExecCommand(value) ? 'copied' : 'failed');
        return;
      }
      await navigator.clipboard.writeText(value);
      mark('copied');
    } catch {
      mark(copyViaExecCommand(value) ? 'copied' : 'failed');
    }
  }

  return (
    <button
      className="copy-button mono tiny-text"
      type="button"
      title={`点击复制：${value}`}
      onClick={() => void copy()}
    >
      <span>
        {state === 'failed' ? '复制失败' : (label ?? value)}
        {state === 'failed' ? `（${value}）` : ''}
      </span>
      <Icon name={state === 'copied' ? 'check' : 'link'} width={12} height={12} />
    </button>
  );
}
