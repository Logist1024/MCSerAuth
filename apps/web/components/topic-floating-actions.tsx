'use client';

import { useEffect, useState } from 'react';
import { Icon } from './icons';

/** Mobile-friendly shortcuts for long topics: jump to composer and back to top. */
export default function TopicFloatingActions({ canReply }: { canReply: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = (): void => {
      setVisible(window.scrollY > 560);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollToComposer(): void {
    document.getElementById('reply')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => document.getElementById('reply-editor')?.focus(), 320);
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="floating-actions">
      {canReply ? (
        <button
          className="floating-action primary"
          type="button"
          onClick={scrollToComposer}
          aria-label="跳到回复框"
          title="参与讨论"
        >
          <Icon name="reply" width={18} height={18} />
          <span className="floating-action-label">回复</span>
        </button>
      ) : null}
      <button
        className="floating-action"
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="回到顶部"
        title="回到顶部"
      >
        <Icon name="chevronUp" width={18} height={18} />
      </button>
    </div>
  );
}
