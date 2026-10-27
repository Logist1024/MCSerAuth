'use client';

import type {
  ForumNotification,
  NotificationListResponse,
  NotificationType,
} from '@mcserauth/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/api-client';
import { describeApiError } from '@/lib/errors';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { Icon, type IconName } from '@/components/icons';
import Pagination from '@/components/pagination';
import { useToast } from '@/components/toast';

const TYPE_LABELS: Record<NotificationType, string> = {
  reply: '回复',
  mention: '提及',
  system: '系统',
  moderation: '审核',
};

const TYPE_ICONS: Record<NotificationType, IconName> = {
  reply: 'message',
  mention: 'at',
  system: 'bell',
  moderation: 'shield',
};

function notificationText(notification: ForumNotification): string {
  if (notification.message !== null && notification.message !== '') {
    return notification.message;
  }
  switch (notification.type) {
    case 'reply':
      return '回复了你的主题';
    case 'mention':
      return '在帖子中提到了你';
    case 'moderation':
      return '有一条审核通知';
    case 'system':
    default:
      return '有一条系统通知';
  }
}

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <section className="panel">
          <p className="muted">加载中…</p>
        </section>
      }
    >
      <NotificationsContent />
    </Suspense>
  );
}

function NotificationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageParam = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const toast = useToast();
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [readingAll, setReadingAll] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | NotificationType>('all');

  const load = useCallback(
    async (showLoading = true, targetPage = page) => {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      try {
        setData(await fetchNotifications({ page: targetPage, pageSize: 20 }));
      } catch (fetchError) {
        setData(null);
        setError(describeApiError(fetchError));
      } finally {
        setLoading(false);
      }
    },
    [page],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (data === null) {
      return [];
    }
    return data.items.filter((notification) => {
      if (statusFilter === 'unread' && notification.readAt !== null) {
        return false;
      }
      if (typeFilter !== 'all' && notification.type !== typeFilter) {
        return false;
      }
      return true;
    });
  }, [data, statusFilter, typeFilter]);

  function markLocally(notification: ForumNotification): void {
    setData((current) => {
      if (current === null) {
        return current;
      }
      return {
        ...current,
        unreadCount: Math.max(0, current.unreadCount - 1),
        items: current.items.map((item) =>
          item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      };
    });
    window.dispatchEvent(new Event('mcserauth:notifications-changed'));
  }

  async function open(notification: ForumNotification): Promise<void> {
    if (busyId !== null) {
      return;
    }
    const wasUnread = notification.readAt === null;
    if (wasUnread) {
      markLocally(notification);
    }
    setBusyId(notification.id);
    try {
      if (wasUnread) {
        await markNotificationRead(notification.id);
      }
      const link = notification.link;
      if (link !== null && link.startsWith('/') && !link.startsWith('//') && !link.includes('\\')) {
        router.push(link);
      } else if (!wasUnread) {
        await load(false);
      }
    } catch (readError) {
      toast.error(describeApiError(readError));
      await load(false);
    } finally {
      setBusyId(null);
    }
  }

  async function readAll(): Promise<void> {
    setReadingAll(true);
    setError(null);
    try {
      await markAllNotificationsRead();
      window.dispatchEvent(new Event('mcserauth:notifications-changed'));
      toast.success('全部通知已标为已读');
      await load(false);
    } catch (readError) {
      toast.error(describeApiError(readError));
    } finally {
      setReadingAll(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>通知</h1>
          <p className="page-description">回复、提及与系统通知。</p>
        </div>
        <div className="page-head-actions">
          {data !== null && data.unreadCount > 0 ? (
            <button
              className="button secondary"
              type="button"
              onClick={() => void readAll()}
              disabled={readingAll}
            >
              <Icon name="check" width={16} height={16} />
              {readingAll ? '处理中…' : `全部标为已读（${data.unreadCount}）`}
            </button>
          ) : null}
        </div>
      </header>

      <section className="panel">
        <div className="notification-toolbar">
          <div className="filter-tabs" role="tablist" aria-label="通知状态">
            <button
              className={`filter-tab${statusFilter === 'all' ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={statusFilter === 'all'}
              onClick={() => setStatusFilter('all')}
            >
              全部
              {data !== null ? <span className="filter-tab-count">{data.items.length}</span> : null}
            </button>
            <button
              className={`filter-tab${statusFilter === 'unread' ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={statusFilter === 'unread'}
              onClick={() => setStatusFilter('unread')}
            >
              未读
              {data !== null ? <span className="filter-tab-count">{data.unreadCount}</span> : null}
            </button>
          </div>

          <select
            className="filter-select"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as 'all' | NotificationType)}
            aria-label="按通知类型筛选"
          >
            <option value="all">全部类型</option>
            <option value="reply">回复</option>
            <option value="mention">提及</option>
            <option value="system">系统</option>
            <option value="moderation">审核</option>
          </select>
        </div>

        {loading ? (
          <div className="loading-state" aria-label="加载中">
            {[0, 1, 2, 3].map((index) => (
              <div className="skeleton-line" key={index} />
            ))}
          </div>
        ) : error !== null ? (
          <div className="empty-state">
            <span className="empty-state-icon">
              <Icon name="alert" width={22} height={22} />
            </span>
            <p className="bad">{error}</p>
            <Link className="button primary" href="/login?next=%2Fnotifications">
              去登录
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">
              <Icon name="inbox" width={22} height={22} />
            </span>
            <p>{statusFilter === 'unread' ? '没有未读通知。' : '暂时没有通知。'}</p>
            <Link className="button ghost" href="/forum">
              返回论坛
            </Link>
          </div>
        ) : (
          <ul className="notification-list">
            {filtered.map((notification) => (
              <li key={notification.id}>
                <button
                  className={`notification-row${notification.readAt === null ? ' unread' : ''}`}
                  type="button"
                  onClick={() => void open(notification)}
                  disabled={busyId === notification.id}
                  aria-label={`${TYPE_LABELS[notification.type]}通知：${notificationText(notification)}`}
                >
                  <span className={`notification-icon ${notification.type}`}>
                    <Icon name={TYPE_ICONS[notification.type]} width={17} height={17} />
                  </span>
                  <span className="notification-body">
                    <span className="notification-title">
                      {notification.actor !== null ? (
                        <strong>{notification.actor.name}</strong>
                      ) : (
                        <strong>{TYPE_LABELS[notification.type]}</strong>
                      )}
                      <span>{notificationText(notification)}</span>
                    </span>
                    <time
                      className="notification-time"
                      dateTime={notification.createdAt}
                      title={formatDateTime(notification.createdAt)}
                    >
                      {formatRelativeTime(notification.createdAt)}
                    </time>
                  </span>
                  {notification.readAt === null ? (
                    <span className="notification-unread-dot" aria-label="未读" />
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {filtered.length > 0 ? (
          <div className="notification-page-foot">
            <Link href="/forum">返回论坛</Link>
          </div>
        ) : null}

        {data !== null ? (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            buildHref={(target) => `/notifications?page=${target}`}
            label="通知分页"
          />
        ) : null}
      </section>
    </>
  );
}
