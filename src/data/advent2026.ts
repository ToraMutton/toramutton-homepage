// src/data/advent2026.ts
// アドベントカレンダー2026の記事管理データ。

export type AdventSource = "local" | "zenn" | "note" | "qiita";

export interface AdventEntry {
  /** 12/1〜12/25。BEGIN・FINISHは advent2026.astro 側で別管理するためここには含めない */
  day: number;
  /** "locked" のままなら title/note を含め一切画面に出ない */
  status: "locked" | "open";
  /** 記事の掲載先。status: "open" のとき必須 */
  source?: AdventSource;
  /** source: "local" のとき、src/content/blog/ 配下のフォルダ名(id) */
  slug?: string;
  /** source: "zenn" | "note" | "qiita" のとき、記事の直URL */
  url?: string;
  /** source: "zenn" | "note" | "qiita" のとき、公開用タイトル(localはblog側から自動取得するので不要) */
  title?: string;
  /** 下書き・ネタ帳。 */
  note?: string;
}

// 一人アドベントカレンダー BEGIN
// 最初から open 扱い(=見た目はアンロック)にしておき、
export const adventKickoff: AdventEntry = {
  day: 0,
  status: "open",
  note: "トラマト一人アドベントカレンダー2026、開始",
};

// 一人アドベントカレンダー END
// 25日が終わるまでは locked のままにしておく
export const adventFinale: AdventEntry = {
  day: 26,
  status: "locked",
  note: "トラマト一人アドベントカレンダー、終了",
};

// 12/1 〜 12/25 本編。
export const adventDays: AdventEntry[] = [
  {
    day: 1,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 2,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 3,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 4,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 5,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 6,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 7,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 8,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 9,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 10,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 11,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 12,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 13,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 14,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 15,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 16,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 17,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 18,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 19,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 20,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 21,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 22,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 23,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 24,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
  {
    day: 25,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "",
  },
];
