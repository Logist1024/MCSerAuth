import Link from 'next/link';
import { Icon } from './icons';

function pageItems(current: number, total: number): (number | 'gap')[] {
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (current >= total - 2) {
    pages.add(total - 1);
    pages.add(total - 2);
    pages.add(total - 3);
  }

  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const items: (number | 'gap')[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous !== 0 && page - previous > 1) {
      items.push('gap');
    }
    items.push(page);
    previous = page;
  }
  return items;
}

export default function Pagination({
  page,
  pageSize,
  total,
  buildHref,
  label = '分页',
}: {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
  label?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (totalPages <= 1) {
    return null;
  }
  const current = Math.min(Math.max(1, page), totalPages);

  return (
    <nav className="pagination" aria-label={label}>
      <span className="sr-only">
        第 {current} 页，共 {totalPages} 页
      </span>
      {current > 1 ? (
        <Link className="page-step" href={buildHref(current - 1)} rel="prev" aria-label="上一页">
          <Icon name="chevronLeft" width={16} height={16} />
          上一页
        </Link>
      ) : (
        <span className="page-step disabled" aria-disabled="true" aria-label="上一页，不可用">
          <Icon name="chevronLeft" width={16} height={16} />
          上一页
        </span>
      )}

      <div className="page-numbers">
        {pageItems(current, totalPages).map((item, index) =>
          item === 'gap' ? (
            <span className="page-gap" key={`gap-${index}`} aria-hidden="true">
              …
            </span>
          ) : item === current ? (
            <span
              className="page-number current"
              key={item}
              aria-current="page"
              aria-label={`第 ${item} 页，当前页`}
            >
              {item}
            </span>
          ) : (
            <Link
              className="page-number"
              href={buildHref(item)}
              key={item}
              aria-label={`第 ${item} 页`}
            >
              {item}
            </Link>
          ),
        )}
      </div>

      {current < totalPages ? (
        <Link className="page-step" href={buildHref(current + 1)} rel="next" aria-label="下一页">
          下一页
          <Icon name="chevronRight" width={16} height={16} />
        </Link>
      ) : (
        <span className="page-step disabled" aria-disabled="true" aria-label="下一页，不可用">
          下一页
          <Icon name="chevronRight" width={16} height={16} />
        </span>
      )}
    </nav>
  );
}
