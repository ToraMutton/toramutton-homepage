// note / Zenn / Qiita の記事を RSS でまとめて取ってくる係。
//
// 以前は index.astro / blog/index.astro / rss.xml.js の3箇所に
// ほぼ同じコードが散らばっていて、少しずつ挙動がズレていた。
// 取得の仕方を変えたくなったら、これからはこのファイルだけ直せばいい。
//
// フィードを増やすときは下の FEEDS に1行足すだけ。

import Parser from "rss-parser";
import { fetchOgpImage } from "./rss";

export type PostSource = "local" | "note" | "zenn" | "qiita";
export type ExternalSource = Exclude<PostSource, "local">;

export interface ExternalPost {
  title: string;
  url: string;
  date: Date;
  /** サムネイル画像のURL。見つからなければ undefined */
  image?: string;
  /** RSS用の説明文 */
  description: string;
  source: ExternalSource;
  tags: string[];
}

interface FeedConfig {
  source: ExternalSource;
  url: string;
  /** RSSにカテゴリが無かったときに代わりに付けるタグ */
  defaultTag: string;
  /** RSSに画像が無いとき、記事ページを開いて OGP 画像を探すか */
  ogpFallback?: boolean;
}

const FEEDS: FeedConfig[] = [
  {
    source: "note",
    url: "https://note.com/toramutton/rss",
    defaultTag: "Note",
  },
  {
    source: "zenn",
    url: "https://zenn.dev/toramutton/feed",
    defaultTag: "Zenn",
  },
  {
    source: "qiita",
    url: "https://qiita.com/ToraMutton/feed",
    defaultTag: "Qiita",
    // Qiita は RSS にサムネイルが入らないので、記事ページから拾う
    ogpFallback: true,
  },
];

const parser = new Parser({
  customFields: {
    item: [
      ["media:thumbnail", "thumbnail"],
      ["category", "categories", { keepArray: true }],
    ],
  },
});

/** サムネイルを探す。media:thumbnail → enclosure → 本文中の最初の画像、の順 */
function pickImage(item: any): string | undefined {
  if (item.thumbnail) {
    return typeof item.thumbnail === "string"
      ? item.thumbnail
      : item.thumbnail.$?.url;
  }
  if (item.enclosure?.url) return item.enclosure.url;
  return item.content?.match(/src="(https:\/\/[^"]+)"/)?.[1];
}

async function loadFeed(feed: FeedConfig): Promise<ExternalPost[]> {
  try {
    // ?t= はキャッシュ避け。CDN に古いフィードを返されないようにする
    const parsed = await parser.parseURL(`${feed.url}?t=${Date.now()}`);

    return await Promise.all(
      parsed.items.map(async (item: any): Promise<ExternalPost> => {
        let image = pickImage(item);
        if (!image && feed.ogpFallback && item.link) {
          image = await fetchOgpImage(item.link);
        }

        const categories = item.categories;
        const tags =
          Array.isArray(categories) && categories.length > 0
            ? categories
            : [feed.defaultTag];

        return {
          title: item.title || "無題",
          url: item.link || "",
          date: new Date(item.pubDate || Date.now()),
          image,
          description: item.contentSnippet || item.title || "",
          source: feed.source,
          tags,
        };
      }),
    );
  } catch (e) {
    // 1つのサイトが落ちていても、他の記事は表示できるようにする
    console.error(`[feeds] ${feed.source} の取得に失敗しました`, e);
    return [];
  }
}

/** ビルド中に何度も同じフィードを取りに行かないよう、1回の結果を使い回す */
let cached: Promise<ExternalPost[]> | null = null;

/**
 * 外部サイトの記事を新しい順で返す。
 *
 * `npm run dev` 中はネットに出ず空配列を返す（毎回の再読み込みで
 * 数秒待たされるのを避けるため）。dev でも実物を見たいときは
 * .env に PUBLIC_FETCH_FEEDS=1 を書けば取得される。
 */
export function getExternalPosts(): Promise<ExternalPost[]> {
  const forced = import.meta.env.PUBLIC_FETCH_FEEDS === "1";
  if (import.meta.env.DEV && !forced) return Promise.resolve([]);

  if (!cached) {
    cached = Promise.all(FEEDS.map(loadFeed)).then((groups) =>
      groups.flat().sort((a, b) => b.date.valueOf() - a.date.valueOf()),
    );
  }
  return cached;
}
