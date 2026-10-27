import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  /** Full text for truncated labels (usually the topic title). */
  title?: string;
}

/** Accessible breadcrumb trail shared by all forum pages. */
export default function Breadcrumbs({
  items,
  label = '面包屑',
  className = '',
}: {
  items: BreadcrumbItem[];
  label?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav className={`breadcrumbs${className === '' ? '' : ` ${className}`}`} aria-label={label}>
      <ol>
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {item.href !== undefined && !current ? (
                <Link href={item.href} title={item.title ?? item.label}>
                  {item.label}
                </Link>
              ) : (
                <span aria-current={current ? 'page' : undefined} title={item.title ?? item.label}>
                  {item.label}
                </span>
              )}
              {!current ? (
                <span className="breadcrumbs-sep" aria-hidden="true">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
