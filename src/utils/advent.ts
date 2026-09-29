import type { CollectionEntry } from "astro:content";
import type { ImageMetadata } from "astro";
import type {
  AdventCalendar,
  AdventEntry,
  AdventSource,
} from "../data/advent2026";
import { fetchOgpImage } from "./rss";

/** 画面に渡す形。公開前は day 以外すべて undefined。下書きメモは含めない。 */
export interface ResolvedAdventEntry {
  url?: string;
  title?: string;
  image?: ImageMetadata | string;
  source?: AdventSource;
}

export interface ResolvedAdventDay extends ResolvedAdventEntry {
  day: number;
}

export interface ResolvedAdventCalendar {
  prologue: ResolvedAdventEntry;
  days: ResolvedAdventDay[];
  epilogue: ResolvedAdventEntry;
  /** 本編で公開済みの記事数 */
  openCount: number;
}

interface ResolveOptions {
  /** 外部記事のサムネイルを OGP から取得する(カレンダーページ用。ビルドが遅くなる) */
  fetchOgp?: boolean;
  now?: Date;
}

const jstDate = (year: number, month: number, day: number) =>
  new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+09:00`,
  );

/** 同じ警告を index / advent2026 の両ページで二重に出さないため */
const warned = new Set<string>();
const warnOnce = (message: string) => {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[advent] ${message}`);
};

/** 日付の抜け・重複はデータの書き間違いなので、公開日に関係なく知らせる */
function validateDays(calendar: AdventCalendar) {
  const seen = new Set<number>();
  for (const { day } of calendar.days) {
    if (seen.has(day)) warnOnce(`12/${day} が重複しています`);
    seen.add(day);
  }
  for (let day = 1; day <= 25; day++) {
    if (!seen.has(day)) warnOnce(`12/${day} のエントリがありません`);
  }
}

/** link から表示用データを作る。リンク先が見つからなければ undefined */
function resolveLink(
  entry: AdventEntry,
  posts: CollectionEntry<"blog">[],
): ResolvedAdventEntry | undefined {
  const { link } = entry;
  if (!link) return undefined;

  if (link.type === "blog") {
    const post = posts.find((post) => post.id === link.slug);
    if (!post) return undefined;
    return {
      url: `/blog/${post.id}/`,
      title: post.data.title,
      image: post.data.heroImage,
      source: "blog",
    };
  }

  if (!link.url) return undefined;
  return { url: link.url, title: link.title, source: link.type };
}

/**
 * カレンダー全体を表示用に変換する。トップページとカレンダーで同じ公開判定を使う。
 * 公開日 (publishAt) を過ぎていて、かつリンク先が解決できたものだけが公開になる。
 */
export async function resolveAdventCalendar(
  calendar: AdventCalendar,
  posts: CollectionEntry<"blog">[],
  { fetchOgp = false, now = new Date() }: ResolveOptions = {},
): Promise<ResolvedAdventCalendar> {
  validateDays(calendar);
  // dev では下書き記事と同じく、公開日前でも表示して見た目を確認できるようにする
  const ignoreDates = import.meta.env.DEV;

  const resolve = async (
    label: string,
    entry: AdventEntry,
    publishAt?: Date,
  ): Promise<ResolvedAdventEntry> => {
    const due = !publishAt || now >= publishAt;
    const resolved = resolveLink(entry, posts);

    // 警告は実際の日付で判定する(dev で未来の日まで警告されると邪魔なので)
    if (due && publishAt && !resolved) {
      warnOnce(
        entry.link
          ? `${label}: 公開日を過ぎていますが、リンク先が見つかりません (${JSON.stringify(entry.link)})`
          : `${label}: 公開日を過ぎていますが、link が未設定です`,
      );
    }

    if (!resolved || !(due || ignoreDates)) return {};
    if (fetchOgp && resolved.source !== "blog" && resolved.url) {
      resolved.image = await fetchOgpImage(resolved.url);
    }
    return resolved;
  };

  const { year } = calendar;
  const [prologue, epilogue, days] = await Promise.all([
    resolve("prologue", calendar.prologue),
    resolve("epilogue", calendar.epilogue, jstDate(year, 12, 26)),
    Promise.all(
      [...calendar.days]
        .sort((a, b) => a.day - b.day)
        .map(async (entry) => ({
          day: entry.day,
          ...(await resolve(`12/${entry.day}`, entry, jstDate(year, 12, entry.day))),
        })),
    ),
  ]);

  return {
    prologue,
    epilogue,
    days,
    openCount: days.filter((entry) => entry.url).length,
  };
}
