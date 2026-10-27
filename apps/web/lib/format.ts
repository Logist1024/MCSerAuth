export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value));
}

const relativeFormatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });

/** Compact forum timestamp: "3 分钟前" for recent activity, a date afterwards. */
export function formatRelativeTime(value: string): string {
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);

  if (Number.isNaN(date.getTime())) {
    return value;
  }
  if (absMs < 60_000) {
    return '刚刚';
  }
  if (absMs < 3_600_000) {
    return relativeFormatter.format(Math.round(diffMs / 60_000), 'minute');
  }
  if (absMs < 86_400_000) {
    return relativeFormatter.format(Math.round(diffMs / 3_600_000), 'hour');
  }
  if (absMs < 7 * 86_400_000) {
    return relativeFormatter.format(Math.round(diffMs / 86_400_000), 'day');
  }
  return formatDate(value);
}
