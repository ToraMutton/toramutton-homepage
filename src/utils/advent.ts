import type { CollectionEntry } from "astro:content";
import type { ImageMetadata } from "astro";
import type { AdventEntry, AdventSource } from "../data/advent2026";

export interface ResolvedAdventEntry {
  day: number;
  status: "locked" | "open";
  url?: string;
  title?: string;
  image?: ImageMetadata | string;
  source?: AdventSource;
}

/** トップページとカレンダーで同じ公開判定を使う。下書きメモは返さない。 */
export function resolveAdventEntry(
  entry: AdventEntry,
  posts: CollectionEntry<"blog">[],
): ResolvedAdventEntry {
  const locked = { day: entry.day, status: "locked" as const };
  if (entry.status !== "open") return locked;

  if (entry.source === "local") {
    const post = posts.find((post) => post.id === entry.slug);
    if (!post) return locked;
    return {
      day: entry.day,
      status: "open",
      url: `/blog/${post.id}/`,
      title: post.data.title,
      image: post.data.heroImage,
      source: "local",
    };
  }

  if (entry.url) {
    return {
      day: entry.day,
      status: "open",
      url: entry.url,
      title: entry.title,
      source: entry.source,
    };
  }

  // リンク未設定の開始バナーなど。公開記事数には含めない。
  return { day: entry.day, status: "open" };
}
