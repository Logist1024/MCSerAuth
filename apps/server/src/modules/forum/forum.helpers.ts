/** Strips common Markdown syntax to build a plain-text post excerpt. */
export function excerptOf(contentMd: string, maxLength = 160): string {
  const plain = contentMd
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/^\s*[-+]?\s*/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain;
}

/** Extracts `@nickname` mentions (Minecraft user names: 3–16 [A-Za-z0-9_]). */
export function extractMentionNames(contentMd: string): string[] {
  const names = new Set<string>();
  for (const match of contentMd.matchAll(/(?:^|[^\w@])@([A-Za-z0-9_]{3,16})/g)) {
    const name = match[1];
    if (name !== undefined) {
      names.add(name);
    }
  }
  return [...names];
}
