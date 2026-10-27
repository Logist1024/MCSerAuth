import type { ForumPostSummary, Paginated } from '@mcserauth/shared';
import { publicApiFetch } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export async function GET(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  const posts = await publicApiFetch<Paginated<ForumPostSummary>>(
    '/api/forum/posts?pageSize=50',
    300,
  );

  const items = (posts?.items ?? [])
    .map((post) => {
      const link = `${origin}/forum/post/${post.id}`;
      return [
        '<item>',
        `<title>${escapeXml(post.title)}</title>`,
        `<link>${escapeXml(link)}</link>`,
        `<guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `<pubDate>${new Date(post.createdAt).toUTCString()}</pubDate>`,
        `<category>${escapeXml(post.category.name)}</category>`,
        `<description>${escapeXml(post.excerpt)}</description>`,
        '</item>',
      ].join('');
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>MCSerAuth 论坛</title>
    <link>${escapeXml(`${origin}/forum`)}</link>
    <description>MCSerAuth 社区论坛最新帖子</description>
    <language>zh-CN</language>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
