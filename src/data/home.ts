// トップページ（src/pages/index.astro）に出す内容。
// 見た目を変えずに中身だけ足したい・直したいときは、このファイルだけ触ればいい。
//
// アイコンは https://lucide.dev で名前を探して、下の import に足してから使う。

import {
  Cake,
  Milestone,
  Rocket,
  ShieldCheck,
} from "lucide-astro";
import {
  GITHUB_URL,
  NOTE_URL,
  QIITA_URL,
  TW_DAILY_URL,
  ZENN_URL,
} from "../consts";
import type { MissionInput } from "../utils/countdown";

/** lucide-astro のアイコン。どれも同じ形なので Cake を代表にして型を借りている */
type Icon = typeof Cake;

// ---- SOCIAL セクション ----
// アイコンは components/BrandIcon.astro で名前から引く。
// 表示する ID は URL の末尾から自動で作る(@ToraMutton など)
export interface Social {
  name: string;
  url: string;
  icon: "github" | "zenn" | "note" | "qiita" | "twitter";
}

export const socials: Social[] = [
  { name: "GitHub", url: GITHUB_URL, icon: "github" },
  { name: "Zenn", url: ZENN_URL, icon: "zenn" },
  { name: "Qiita", url: QIITA_URL, icon: "qiita" },
  { name: "note", url: NOTE_URL, icon: "note" },
  { name: "Twitter", url: TW_DAILY_URL, icon: "twitter" },
];

// ---- Links の紹介文 ----
// トップの Others と /links ページで共通に使う
export const LINKS_SUMMARY = "相互リンクしているサイト一覧";

// =====================================================
// Countdown カード
// 残り日数はビルド時とブラウザ側で計算されるので、日付だけ書けばいい
//
// - 一回きり: date は "YYYY-MM-DD"。過ぎたら自動で表示されなくなる
//   (残しておいても壊れないけど、ビルドログに「期限切れ」と警告が出るので気が向いたら消す)
// - 毎年: repeat: "yearly" を付けて date は "MM-DD"。過ぎたら自動で翌年を指す
//   title を関数にすると開催年を受け取れる(年齢を入れたいとき用)
// =====================================================
export interface Mission extends MissionInput {
  icon: Icon;
}

export const missions: Mission[] = [
  { title: (y) => `${y}年終了`, date: "12-31", repeat: "yearly", icon: Milestone },
  { title: "2年後期", date: "2027-02-13", icon: ShieldCheck },
  { title: (y) => `${y - 2006}歳の誕生日`, date: "06-20", repeat: "yearly", icon: Cake },
];

// =====================================================
// Uptime カード
// since からの経過日数を数える。行を足せばそのまま増える
// =====================================================
export interface Uptime {
  label: string;
  /** YYYY-MM-DD（JST の 0時起点で数える） */
  since: string;
  icon: Icon;
}

export const uptimes: Uptime[] = [
  { label: "生まれてから", since: "2006-06-20", icon: Cake },
  { label: "このサイトができてから", since: "2026-01-02", icon: Rocket },
];
