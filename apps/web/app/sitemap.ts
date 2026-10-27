import type { ForumCategory, ForumPostSummary, Paginated } from '@mcserauth/shared';
import type { MetadataRoute } from 'next';
import { publicApiFetch } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

function flatten(categories: ForumCategory[]): ForumCategory[] {
  return categories.flatMap((category) => [category, ...flatten(category.children)]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: 'hourly', priority: 1 },
    { url: `${BASE_URL}/forum`, changeFrequency: 'hourly', priority: 0.9 },
  ];

  const [categories, posts] = await Promise.all([
    publicApiFetch<ForumCategory[]>('/api/forum/categories', 300),
    publicApiFetch<Paginated<ForumPostSummary>>('/api/forum/posts?pageSize=100', 300),
  ]);

  if (categories) {
    for (const category of flatten(categories)) {
      entries.push({
        url: `${BASE_URL}/forum/${category.slug}`,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }
  }
  if (posts) {
    for (const post of posts.items) {
      entries.push({
        url: `${BASE_URL}/forum/post/${post.id}`,
        lastModified: new Date(post.lastActivityAt),
        changeFrequency: 'daily',
        priority: 0.6,
      });
    }
  }

  return entries;
}
