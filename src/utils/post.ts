// src/utils/post.ts
import { getCollection, type CollectionEntry } from "astro:content";

type BlogData = CollectionEntry<"blog">["data"];

/**
 * pubDate の「日付」を、その日の 0:00(JST) として扱った公開時刻。
 *
 * pubDate: 2026-12-16 と書くと Date としては UTC の 0:00(= JST 9:00) になってしまう。
 * それだと「12/16 0:00 に公開」にならないので、日付の部分だけ取り出して JST の 0:00 に読み替える。
 * (時刻まで書いても無視される。時刻指定の予約はできない)
 */
export function publishAt(pubDate: Date): Date {
  return new Date(`${pubDate.toISOString().slice(0, 10)}T00:00:00+09:00`);
}

/**
 * ローカル記事を公開してよいか。
 *    - draft: true なら非公開(書いている途中)
 *    - draft: false でも、pubDate(JST 0:00) になるまでは非公開 = Zenn の published_at 相当の予約公開
 *    - dev サーバーでは確認用にすべて見せる
 *
 * ページは焼き込み(prerender)なので、「now」はビルドした時刻。
 * 公開日の 0:00 以降にサイトをリビルドするまでは反映されない。
 */
export function isPublished(data: BlogData, now: Date = new Date()): boolean {
  if (import.meta.env.DEV) return true;
  return data.draft !== true && publishAt(data.pubDate) <= now;
}

export async function getVisiblePosts(
  now: Date = new Date(),
): Promise<CollectionEntry<"blog">[]> {
  return await getCollection("blog", ({ data }) => isPublished(data, now));
}
