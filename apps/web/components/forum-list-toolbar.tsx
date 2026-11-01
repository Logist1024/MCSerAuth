import { POST_SORT_OPTIONS, type PostSortOption } from '@mcserauth/shared';
import Link from 'next/link';
import { buildForumListHref, POST_SORT_LABELS } from '@/lib/forum-ui';
import { Icon } from './icons';

/**
 * 主题列表工具栏：排序 Tab + 标题搜索框。
 * 纯服务端组件——排序用链接切换，搜索用原生 GET 表单提交，无需客户端状态。
 */
export default function ForumListToolbar({
  basePath,
  sort,
  search,
}: {
  basePath: string;
  sort: PostSortOption;
  search?: string;
}) {
  return (
    <div className="forum-toolbar">
      <nav className="forum-toolbar-tabs" aria-label="主题排序">
        {POST_SORT_OPTIONS.map((option) => (
          <Link
            className={`forum-toolbar-tab${option === sort ? ' active' : ''}`}
            href={buildForumListHref(basePath, { sort: option, search })}
            aria-current={option === sort ? 'page' : undefined}
            key={option}
          >
            {POST_SORT_LABELS[option]}
          </Link>
        ))}
      </nav>
      <form className="forum-toolbar-search" action={basePath} method="get" role="search">
        <input type="hidden" name="sort" value={sort} />
        <input
          className="forum-toolbar-input"
          type="search"
          name="search"
          defaultValue={search}
          placeholder="搜索主题标题…"
          maxLength={50}
          aria-label="搜索主题标题"
        />
        <button className="button ghost small" type="submit" aria-label="搜索">
          <Icon name="search" width={15} height={15} />
          搜索
        </button>
      </form>
    </div>
  );
}
