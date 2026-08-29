import rss from "@astrojs/rss";
import { SITE_DESCRIPTION, SITE_TITLE } from "../consts";
import { getVisiblePosts } from "../utils/post";
// note / Zenn / Qiita の取得は src/utils/feeds.ts に集約している
import { getExternalPosts } from "../utils/feeds";

export const prerender = true;

export async function GET(context) {
  const posts = await getVisiblePosts();
  const localItems = posts.map((post) => ({
    ...post.data,
    link: `/blog/${post.id}/`,
  }));

  const externalItems = (await getExternalPosts()).map((post) => ({
    title: post.title,
    pubDate: post.date,
    description: post.description,
    link: post.url,
  }));

  const allItems = [...localItems, ...externalItems].sort(
    (a, b) => b.pubDate.valueOf() - a.pubDate.valueOf(),
  );

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site,
    items: allItems,
  });
}
