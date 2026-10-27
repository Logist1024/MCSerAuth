import type { ForumCategory } from '@mcserauth/shared';

export interface FlatCategory {
  id: number;
  name: string;
  depth: number;
  category: ForumCategory;
}

export function flattenCategories(categories: ForumCategory[], depth = 0): FlatCategory[] {
  return categories.flatMap((category) => [
    { id: category.id, name: category.name, depth, category },
    ...flattenCategories(category.children, depth + 1),
  ]);
}

export function findCategory(categories: ForumCategory[], slug: string): ForumCategory | null {
  for (const category of categories) {
    if (category.slug === slug) {
      return category;
    }
    const child = findCategory(category.children, slug);
    if (child) {
      return child;
    }
  }
  return null;
}

/** Returns the root-to-target path, or an empty array when the slug is unknown. */
export function findCategoryPath(categories: ForumCategory[], slug: string): ForumCategory[] {
  for (const category of categories) {
    if (category.slug === slug) {
      return [category];
    }
    const childPath = findCategoryPath(category.children, slug);
    if (childPath.length > 0) {
      return [category, ...childPath];
    }
  }
  return [];
}
