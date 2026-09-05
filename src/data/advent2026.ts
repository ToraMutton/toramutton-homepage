// src/data/advent2026.ts
// アドベントカレンダー2026の記事管理データ。

export const adventCalendar: { year: number; adventarUrl?: string } = {
  year: 2026,
  // Adventarでカレンダーを作成したら、ここにURLを設定する。
  // adventarUrl: "https://adventar.org/calendars/…",
};

export type AdventSource = "local" | "zenn" | "note" | "qiita";

export interface AdventEntry {
  /** 本編は12/1〜12/25。番外編のBEGINは0、FINISHは26 */
  day: number;
  /** "locked" のままなら title/note を含め一切画面に出ない */
  status: "locked" | "open";
  /** 記事の掲載先。リンクを公開するときに設定する */
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
// open 指定でも、記事リンクを設定するまでは他の未公開カードと同じ表示。
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
    source: "local",
    slug: "what-is-arch",
    note: "Arch Linuxって何？ おいしいの？",
  },
  {
    day: 2,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "RustでDiscord動画保存Botを作った話",
  },
  {
    day: 3,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "Windows 11とArch Linuxをデュアルブートする生活とは",
  },
  {
    day: 4,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "私のArch Linuxデスクトップができるまで",
  },
  {
    day: 5,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "dotfilesをGitHubで管理すると何がうれしいのか",
  },
  {
    day: 6,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "Canvas APIで幾何学アート生成ツール「ArToram」を作った",
  },
  {
    day: 7,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "Three.jsでMinecraftスキンエディター「Vextora」を作った",
  },
  {
    day: 8,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "Google Classroom向けChrome拡張を作った話",
  },
  {
    day: 9,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "個人開発はどこまで作ったら「完成」なのか",
  },
  {
    day: 10,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "個人サイト文化が好きだという話",
  },
  {
    day: 11,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "初心者を置いていかない技術記事の書き方",
  },
  {
    day: 12,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "大学2年生、技術を広く触りすぎ問題",
  },
  {
    day: 13,
    status: "locked",
    source: "zenn",
    url: "",
    title: "",
    note: "なぜ自作プログラミング言語を作りたいのか",
  },
  {
    day: 14,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "Rustの所有権を結局どう理解したか",
  },
  {
    day: 15,
    status: "locked",
    source: "qiita",
    url: "",
    title: "",
    note: "個人サイトを作って1年なので全部紹介する",
  },
  {
    day: 16,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "トラマト2026年やらかし大賞",
  },
  {
    day: 17,
    status: "locked",
    source: "zenn",
    url: "",
    title: "",
    note: "Radeon＋ROCmでローカルLLM環境「TORANOI」を作る",
  },
  {
    day: 18,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "Gitをバックアップ装置だと思っていた頃の私へ",
  },
  {
    day: 19,
    status: "locked",
    source: "local",
    // slug: "",
    note: "個人開発のアイデアはどこから生まれるのか",
  },
  {
    day: 20,
    status: "locked",
    source: "local",
    slug: "prog-assign",
    note: "電通大Ⅰ類のプログラム配属を考えた記録",
  },
  {
    day: 21,
    status: "locked",
    source: "local",
    slug: "fe-ap",
    note: "基本情報技術者試験に合格するまで",
  },
  {
    day: 22,
    status: "locked",
    source: "local",
    slug: "failure-beginner-llm",
    note: "生成AI時代に技術を学び始めて経験した成功と失敗",
  },
  {
    day: 23,
    status: "locked",
    source: "note",
    url: "",
    title: "買ってよかったもの2026",
    note: "2026年に買ってよかったもの",
  },
  {
    day: 24,
    status: "locked",
    source: "local",
    slug: "product-2026",
    note: "2026年に作ったもの全部振り返る",
  },
  {
    day: 25,
    status: "locked",
    // source: "local", slug: "",
    // source: "zenn" | "note" | "qiita", url: "", title: "",
    note: "作ることが好きな理由",
  },
];
