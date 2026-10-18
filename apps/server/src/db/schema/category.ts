import { integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

/** Forum category tree (self-referencing `parent_id`). */
export const category = sqliteTable('category', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  parentId: integer('parent_id').references((): AnySQLiteColumn => category.id, {
    onDelete: 'set null',
  }),
});
