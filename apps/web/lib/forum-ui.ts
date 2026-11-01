import type { CSSProperties } from 'react';
import { POST_SORT_OPTIONS, type PostSortOption, type UserRole } from '@mcserauth/shared';

export const POST_SORT_LABELS: Record<PostSortOption, string> = {
  activity: '最新回复',
  created: '最新发布',
  hot: '热门',
};

/** 解析列表页查询参数里的 sort，非法值回退到默认的 activity。 */
export function parsePostSort(value: string | undefined): PostSortOption {
  return (POST_SORT_OPTIONS as readonly string[]).includes(value ?? '')
    ? (value as PostSortOption)
    : 'activity';
}

/** 构建论坛列表页链接：默认值不写入查询串，保持 URL 干净。 */
export function buildForumListHref(
  basePath: string,
  params: { page?: number; sort?: PostSortOption; search?: string },
): string {
  const query = new URLSearchParams();
  if (params.sort !== undefined && params.sort !== 'activity') {
    query.set('sort', params.sort);
  }
  if (params.search !== undefined && params.search !== '') {
    query.set('search', params.search);
  }
  if (params.page !== undefined && params.page > 1) {
    query.set('page', String(params.page));
  }
  const qs = query.toString();
  return qs === '' ? basePath : `${basePath}?${qs}`;
}

export function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function hueFromString(value: string): number {
  return stableHash(value) % 360;
}

export function categoryStyle(seed: string | number): CSSProperties {
  return { '--cat-hue': String(hueFromString(String(seed))) } as CSSProperties;
}

export function avatarStyle(name: string): CSSProperties {
  return { '--avatar-hue': String(hueFromString(name)) } as CSSProperties;
}

export function initials(name: string): string {
  const chars = [...name.trim()];
  if (chars.length === 0) {
    return '?';
  }
  return chars.slice(0, 2).join('').toUpperCase();
}

export function roleLabel(role: UserRole | string | null | undefined): string {
  switch (role) {
    case 'superadmin':
      return '超级管理员';
    case 'admin':
      return '管理员';
    case 'reviewer':
    case 'mod':
      return '审核员';
    case 'user':
      return '成员';
    default:
      return role ?? '成员';
  }
}

export function roleClass(role: UserRole | string | null | undefined): string {
  if (role === 'superadmin' || role === 'admin' || role === 'reviewer') {
    return `role-${role}`;
  }
  if (role === 'mod') {
    return 'role-reviewer';
  }
  return 'role-user';
}
