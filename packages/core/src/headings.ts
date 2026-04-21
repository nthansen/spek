export interface Heading {
  level: 2 | 3;
  text: string;
  slug: string;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

const HEADING_RE = /^(#{2,3})\s+(.+?)\s*$/;
const FENCE_RE = /^(`{3,}|~{3,})/;

export function extractHeadings(content: string): Heading[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const headings: Heading[] = [];
  const slugCounts = new Map<string, number>();
  let fence: string | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const marker = fenceMatch[1][0].repeat(3);
      if (fence === null) {
        fence = marker;
      } else if (line.trimStart().startsWith(fence)) {
        fence = null;
      }
      continue;
    }
    if (fence !== null) continue;

    const match = line.match(HEADING_RE);
    if (!match) continue;
    const level = match[1].length as 2 | 3;
    const text = match[2].trim();
    const baseSlug = slugifyHeading(text);
    if (!baseSlug) continue;
    const count = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, count + 1);
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
    headings.push({ level, text, slug });
  }

  return headings;
}
