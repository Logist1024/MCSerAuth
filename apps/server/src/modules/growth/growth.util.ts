import { NotFoundException } from '@nestjs/common';
import type { BannerSummary, UserTitleSummary } from '@mcserauth/shared';
import { eq } from 'drizzle-orm';
import type { CanonicalDb, DbService } from '../../db/db.service.js';
import { banner as bannerTable, title as titleTable, userProgress } from '../../db/schema/index.js';

export type ProgressRow = typeof userProgress.$inferSelect;
export type TitleRow = typeof titleTable.$inferSelect;
export type BannerRow = typeof bannerTable.$inferSelect;
export type Tx = CanonicalDb;

/**
 * Loads the progress row and locks it until the surrounding transaction ends.
 *
 * SQLite already takes a database-wide write lock with BEGIN IMMEDIATE, so a
 * plain read is protected there; MySQL/PostgreSQL need SELECT ... FOR UPDATE.
 * Every balance mutation must go through this helper so two concurrent
 * requests cannot both read the same wallet and overwrite each other.
 */
export async function lockProgressRow(db: DbService, tx: Tx, userId: string): Promise<ProgressRow> {
  const query = tx.select().from(userProgress).where(eq(userProgress.userId, userId));
  const rows = db.dialect === 'sqlite' ? await query : await query.for('update');
  const row = rows[0];
  if (row === undefined) {
    throw new NotFoundException('账号不存在');
  }
  return row;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const GROWTH_RULES_KEY = 'growthRules';
export const SPECIAL_TITLES = [
  { name: '赞助商', description: '为服务器与社区提供赞助支持', color: '#f59e0b' },
  { name: '合作伙伴', description: '长期协作的社区伙伴', color: '#0ea5e9' },
  { name: '友商', description: '友好互助的兄弟服务器', color: '#22c55e' },
] as const;

/** Chinese calendar day used for daily check-ins (server time zone independent). */
export function dayKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function shiftDay(day: string, offset: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1));
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function startOfShanghaiDay(now = new Date()): Date {
  return new Date(`${dayKey(now)}T00:00:00+08:00`);
}

export function clampText(value: string | undefined, max: number): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, max);
}

export function toTitleSummary(row: TitleRow): UserTitleSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    description: row.description,
    color: row.color,
  };
}

export function toBannerSummary(row: BannerRow, ownerName: string): BannerSummary {
  return {
    id: row.id,
    userId: row.userId,
    ownerName,
    title: row.title,
    description: row.description,
    href: row.href,
    status: row.status,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
