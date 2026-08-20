// src/utils/posts.ts
import { getCollection, type CollectionEntry } from "astro:content";

/** Zenn CLI の published: false 相当。ローカルでのみ下書きが見える */
export async function getVisiblePosts(): Promise<CollectionEntry<"blog">[]> {
  const isDev = import.meta.env.DEV;
  return await getCollection(
    "blog",
    ({ data }) => isDev || data.draft !== true,
  );
}
