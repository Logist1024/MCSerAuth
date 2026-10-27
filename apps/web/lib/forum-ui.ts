import type { CSSProperties } from 'react';
import type { UserRole } from '@mcserauth/shared';

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
