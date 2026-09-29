// src/data/advent2026.ts
// アドベントカレンダー2026の記事管理データ。
//
// 公開ルール(判定は src/utils/advent.ts):
//    - 本編は「12/N 0:00(JST)を過ぎている」かつ「link が設定済み」になると自動で公開される。
//      サイトは毎朝の定期リビルドで焼き直されるので、その時点で反映される。
//    - prologue は link を設定した時点で公開。epilogue は 12/26 から公開。
//    - memo は下書き・ネタ帳。公開後も画面には一切出ない。
//    - dev サーバーでは日付を無視して、link 済みの記事をすべて表示する(下書き記事と同じ扱い)。

/**
 * 記事の掲載先。type によって必須項目が変わる。
 *    - blog : src/content/blog/ 配下のフォルダ名(id)。タイトル・サムネイルは記事側から自動取得
 *    - zenn / note / qiita : 記事の直URLと公開用タイトル。サムネイルは OGP から自動取得
 */
export type AdventLink =
  | { type: "blog"; slug: string }
  | { type: "zenn" | "note" | "qiita"; url: string; title: string };

export type AdventSource = AdventLink["type"];

export interface AdventEntry {
  /** 下書き・ネタ帳。画面には出ない */
  memo?: string;
  /** 掲載先が決まったら設定する。未設定のあいだは「公開待ち」のまま */
  link?: AdventLink;
}

export interface AdventDay extends AdventEntry {
  /** 12月の日付(1〜25) */
  day: number;
}

export interface AdventCalendar {
  year: number;
  /** Adventarでカレンダーを作成したら設定する */
  adventarUrl?: string;
  /** 開始前の番外編(BEGIN) */
  prologue: AdventEntry;
  /** 12/1〜12/25 本編 */
  days: AdventDay[];
  /** 終了後の番外編(FINISH) */
  epilogue: AdventEntry;
}

export const advent2026: AdventCalendar = {
  year: 2026,
  // adventarUrl: "https://adventar.org/calendars/…",

  prologue: {
    memo: "トラマト一人アドベントカレンダー2026、開始",
    link: { type: "blog", slug: "advent2026-start" },
  },
  epilogue: {
    memo: "トラマト一人アドベントカレンダー、終了",
    link: { type: "blog", slug: "advent2026-finish" },
  },

  days: [
    {
      day: 1,
      memo: "Arch Linuxって何？ おいしいの？",
      link: { type: "blog", slug: "what-is-arch" },
    },
    {
      day: 2,
      memo: "RustでDiscordのTwitter動画保存Botを作った話",
      link: {
        type: "zenn",
        url: "",
        title: "RustでDiscordのTwitter動画保存Botを作った話",
      },
    },
    {
      day: 3,
      memo: "Canvas APIで幾何学アート生成ツール「ArToram」を作った",
      link: { type: "blog", slug: "make-artoram" },
    },
    {
      day: 4,
      memo: "Windows 11とArch Linuxをデュアルブートする生活とは",
      link: {
        type: "qiita",
        url: "",
        title: "Windows 11とArch Linuxをデュアルブートする生活とは",
      },
    },
    {
      day: 5,
      memo: "Rubyだけでブルアカの背景を描いてみた",
      link: { type: "blog", slug: "ba-bg-ruby" },
    },
    {
      day: 6,
      memo: "私のArch Linuxデスクトップができるまで",
      link: { type: "blog", slug: "make-arch" },
    },
    {
      day: 7,
      memo: "Three.jsでMinecraftスキンエディター「Vextra」を作った",
      link: { type: "blog", slug: "make-vextra" },
    },
    {
      day: 8,
      memo: "初心者を置いていかない技術記事の書き方",
      link: {
        type: "note",
        url: "",
        title: "初心者をおいていかない技術記事の書き方",
      },
    },
    {
      day: 9,
      memo: "技術触りたての昔の記事を、今の自分が添削してみる",
      link: {
        type: "note",
        url: "",
        title: "技術触りたての昔の記事を、今の自分が添削してみる",
      },
    },
    {
      day: 10,
      memo: "ClassroomのPDFダウンロードがめんどくさいので拡張機能を作った話",
      link: {
        type: "zenn",
        url: "",
        title: "ClassroomのPDFダウンロードがめんどくさいので拡張機能を作った話",
      },
    },
    {
      day: 11,
      memo: "Caelestia ShellにAI使用量を表示してみた",
      link: {
        type: "note",
        url: "",
        title: "Caelestia ShellにAI使用量を表示してみた",
      },
    },
    {
      day: 12,
      memo: "Gitのコミットメッセージだけで一年を振り返れるのか",
      link: {
        type: "qiita",
        url: "",
        title: "Gitのコミットメッセージだけで一年を振り返れるのか",
      },
    },
    {
      day: 13,
      memo: "技術書を1冊書いて公開してみた話",
      link: { type: "note", url: "", title: "技術書を1冊書いて公開してみた話" },
    },
    {
      day: 14,
      memo: "ローカル記事・Zenn・note・Qiitaをどう使い分ける？",
      link: {
        type: "note",
        url: "",
        title: "ローカル記事・Zenn・note・Qiitaをどう使い分ける？",
      },
    },
    {
      day: 15,
      memo: "個人サイトを作ってもうすぐ1年なので全部紹介する",
      link: {
        type: "qiita",
        url: "",
        title: "個人サイトを作ってもうすぐ1年なので全部紹介する",
      },
    },
    {
      day: 16,
      memo: "トラマト2026年やらかし大賞",
      link: { type: "blog", slug: "yarakashi26" },
    },
    {
      day: 17,
      memo: "Radeon＋ROCmでローカルLLM環境を作ってみた話",
      link: {
        type: "zenn",
        url: "",
        title: "Radeon＋ROCmでローカルLLM環境を作ってみた話",
      },
    },
    {
      day: 18,
      memo: "2026年で私の開発環境から消えたもの・増えたもの",
      link: {
        type: "note",
        url: "",
        title: "2026年で私の開発環境から消えたもの・増えたもの",
      },
    },
    {
      day: 19,
      memo: "プログラミング未経験者が電通大で1年半過ごしてみて",
      link: {
        type: "note",
        url: "",
        title: "プログラミング未経験者が電通大で1年半過ごしてみて",
      },
    },
    {
      day: 20,
      memo: "電通大Ⅰ類のプログラム配属を考えた記録",
      link: { type: "blog", slug: "prog-assign" },
    },
    {
      day: 21,
      memo: "基本情報技術者試験に合格するまで",
      link: { type: "blog", slug: "fe-ap" },
    },
    {
      day: 22,
      memo: "生成AI時代に技術を学び始めて経験した成功と失敗",
      link: { type: "blog", slug: "failure-beginner-llm" },
    },
    {
      day: 23,
      memo: "2026年に買ってよかったもの",
      link: { type: "note", url: "", title: "買ってよかったもの2026" },
    },
    {
      day: 24,
      memo: "2026年に作ったもの全部振り返る",
      link: { type: "blog", slug: "product-2026" },
    },
    {
      day: 25,
      memo: "作ることが好きな理由",
      link: { type: "blog", slug: "why" },
    },
  ],
};
