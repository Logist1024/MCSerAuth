import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import type { ForumCategory } from '@mcserauth/shared';
import { count, eq, max } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import { category as categoryTable, post as postTable } from '../../db/schema/index.js';

export const DEFAULT_CATEGORIES = [
  { name: '服务器动态', slug: 'server-news', description: '开服、维护与活动公告', sortOrder: 10 },
  { name: '攻略交流', slug: 'guides', description: '玩法、建筑与红石心得', sortOrder: 20 },
  { name: '建议反馈', slug: 'feedback', description: '对社区与认证服务的建议', sortOrder: 30 },
  { name: '水区', slug: 'off-topic', description: '轻松闲聊', sortOrder: 40 },
];

type CategoryRow = typeof categoryTable.$inferSelect;

/** Category tree, seed data, descendant expansion and aggregate counts. */
@Injectable()
export class ForumCategoryService implements OnModuleInit {
  private readonly logger = new Logger(ForumCategoryService.name);

  constructor(private readonly db: DbService) {}

  onModuleInit(): void {
    const existing = this.db.db.select({ value: count() }).from(categoryTable).get();
    if ((existing?.value ?? 0) > 0) {
      return;
    }
    this.db.db.insert(categoryTable).values(DEFAULT_CATEGORIES).run();
    this.logger.log(`Seeded ${DEFAULT_CATEGORIES.length} default forum categories`);
  }

  listCategories(): ForumCategory[] {
    const categories = this.db.db
      .select()
      .from(categoryTable)
      .orderBy(categoryTable.sortOrder, categoryTable.id)
      .all();

    const counts = this.db.db
      .select({ categoryId: postTable.categoryId, value: count() })
      .from(postTable)
      .where(eq(postTable.status, 'published'))
      .groupBy(postTable.categoryId)
      .all();
    const activity = this.db.db
      .select({ categoryId: postTable.categoryId, value: max(postTable.lastActivityAt) })
      .from(postTable)
      .where(eq(postTable.status, 'published'))
      .groupBy(postTable.categoryId)
      .all();

    const countMap = new Map(counts.map((row) => [row.categoryId, row.value]));
    const activityMap = new Map(activity.map((row) => [row.categoryId, row.value]));

    const nodes = new Map<number, ForumCategory>();
    for (const row of categories) {
      nodes.set(row.id, {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        sortOrder: row.sortOrder,
        parentId: row.parentId,
        postCount: countMap.get(row.id) ?? 0,
        lastActivityAt: toIso(activityMap.get(row.id) ?? null),
        children: [],
      });
    }

    const roots: ForumCategory[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // Parent boards report the total of their own posts plus descendants.
    const aggregate = new Map<number, number>();
    const sumPosts = (node: ForumCategory): number => {
      const total =
        (countMap.get(node.id) ?? 0) +
        node.children.reduce((accumulator, child) => accumulator + sumPosts(child), 0);
      aggregate.set(node.id, total);
      return total;
    };
    for (const root of roots) {
      sumPosts(root);
    }
    for (const node of nodes.values()) {
      node.postCount = aggregate.get(node.id) ?? node.postCount;
    }

    return roots;
  }

  getCategoryBySlug(slug: string): CategoryRow {
    const row = this.db.db.select().from(categoryTable).where(eq(categoryTable.slug, slug)).get();
    if (!row) {
      throw new NotFoundException('版块不存在');
    }
    return row;
  }

  descendantCategoryIds(categoryId: number): number[] {
    const rows = this.db.db
      .select({ id: categoryTable.id, parentId: categoryTable.parentId })
      .from(categoryTable)
      .all();
    const result = new Set<number>([categoryId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        if (row.parentId !== null && result.has(row.parentId) && !result.has(row.id)) {
          result.add(row.id);
          changed = true;
        }
      }
    }
    return [...result];
  }
}

function toIso(value: Date | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toISOString();
}
