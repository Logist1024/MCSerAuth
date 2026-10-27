'use client';

import Link from 'next/link';
import { useState } from 'react';
import { voteForumPost, voteForumReply } from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { Icon } from './icons';
import Spinner from './spinner';
import { useToast } from './toast';

export default function VoteButton({
  targetType,
  targetId,
  initialVoted,
  initialCount,
  signedIn,
  loginHref = '/login',
}: {
  targetType: 'post' | 'reply';
  targetId: number;
  initialVoted: boolean;
  initialCount: number;
  signedIn: boolean;
  loginHref?: string;
}) {
  const toast = useToast();
  const [voted, setVoted] = useState(initialVoted);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  if (!signedIn) {
    return (
      <Link
        className="vote-button"
        href={loginHref}
        title="登录后可点赞"
        aria-label={`登录后可点赞，当前 ${count} 个赞`}
      >
        <Icon name="thumbsUp" width={15} height={15} />
        <span>{count}</span>
      </Link>
    );
  }

  async function toggle(): Promise<void> {
    if (busy) {
      return;
    }
    const previousVoted = voted;
    const previousCount = count;
    const nextVoted = !voted;
    setVoted(nextVoted);
    setCount(Math.max(0, count + (nextVoted ? 1 : -1)));
    setAnnouncement(nextVoted ? '已点赞' : '已取消点赞');
    setBusy(true);
    try {
      const result =
        targetType === 'post' ? await voteForumPost(targetId) : await voteForumReply(targetId);
      setVoted(result.voted);
      setCount(result.voteCount);
      setAnnouncement(result.voted ? '已点赞' : '已取消点赞');
    } catch (error) {
      setVoted(previousVoted);
      setCount(previousCount);
      setAnnouncement('点赞失败，请稍后重试');
      toast.error(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vote-box">
      <button
        className={`vote-button${voted ? ' active' : ''}`}
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={voted}
        aria-busy={busy}
        title={voted ? '取消点赞' : '点赞'}
        aria-label={voted ? `取消点赞，当前 ${count} 个赞` : `点赞，当前 ${count} 个赞`}
      >
        {busy ? <Spinner /> : <Icon name="thumbsUp" width={15} height={15} />}
        <span>{voted ? '已赞' : '赞'}</span>
        <span>{count}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
