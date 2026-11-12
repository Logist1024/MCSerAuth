import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';

/**
 * Shared empty / error state block. Server and client components can both use it.
 */
export default function EmptyState({
  icon = 'inbox',
  title,
  description,
  tone = 'default',
  action,
}: {
  icon?: IconName;
  title?: string;
  description: ReactNode;
  tone?: 'default' | 'error';
  action?: ReactNode;
}) {
  return (
    <div className={`empty-state${tone === 'error' ? ' empty-state-error' : ''}`}>
      <span className="empty-state-icon">
        <Icon name={icon} width={22} height={22} />
      </span>
      {title !== undefined ? <h2 className="empty-state-title">{title}</h2> : null}
      <p className={tone === 'error' ? 'bad' : undefined}>{description}</p>
      {action}
    </div>
  );
}
