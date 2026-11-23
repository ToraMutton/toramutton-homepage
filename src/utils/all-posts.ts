// ローカル記事と、note / Zenn / Qiita の記事を 1 本の新しい順リストにまとめる。
// トップの Blog セクション(src/components/home/BlogSection.astro)と、
// 今後作り直す /blog が、同じ並び・同じ形のデータを使うための窓口。
//
// 取得そのものは、ローカルが src/utils/post.ts、外部が src/utils/feeds.ts。
// 外部サイトの記事は dev では空になる(PUBLIC_FETCH_FEEDS=1 で取得。詳しくは feeds.ts)。
import type { ImageMetadata } from "astro";
import { getExternalPosts, type PostSource } from "./feeds";
import { getVisiblePosts } from "./post";

export interface BlogEntry {
  title: string;
  /** ローカルは /blog/<id>/、外部は記事の URL */
  url: string;
  date: Date;
  source: PostSource;
  tags: string[];
  description: string;
  /** ローカルは ImageMetadata(Astro が最適化)、外部は画像の URL */
  image?: ImageMetadata | string;
}

export async function getAllPosts(): Promise<BlogEntry[]> {
  const [local, external] = await Promise.all([getVisiblePosts(), getExternalPosts()]);

  const localEntries: BlogEntry[] = local.map((post) => ({
    title: post.data.title,
    url: `/blog/${post.id}/`,
    date: post.data.pubDate,
    source: "local",
    tags: post.data.tags ?? [],
    description: post.data.description,
    image: post.data.heroImage,
  }));

  const externalEntries: BlogEntry[] = external.map((post) => ({
    title: post.title,
    url: post.url,
    date: post.date,
    source: post.source,
    tags: post.tags,
    description: post.description,
    image: post.image,
  }));

  return [...localEntries, ...externalEntries].sort(
    (a, b) => b.date.valueOf() - a.date.valueOf(),
  );
}
