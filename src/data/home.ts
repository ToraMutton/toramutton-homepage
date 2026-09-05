// トップページ（src/pages/index.astro）に出す内容。
// 見た目を変えずに中身だけ足したい・直したいときは、このファイルだけ触ればいい。
//
// アイコンは https://lucide.dev で名前を探して、下の import に足してから使う。

import {
  Activity,
  Cake,
  Clock,
  Fingerprint,
  GraduationCap,
  Layers,
  Milestone,
  Music,
  Rocket,
  ShieldCheck,
  ThermometerSun,
  User,
} from "lucide-astro";
import {
  GITHUB_URL,
  NOTE_URL,
  QIITA_URL,
  TW_DAILY_URL,
  ZENN_URL,
} from "../consts";

/** lucide-astro のアイコン。どれも同じ形なので Cake を代表にして型を借りている */
type Icon = typeof Cake;

// =====================================================
// ヒーロー(fastfetch 風)の右側に出る情報
// 左の ASCII アートは scripts/ascii-avatar.mjs が生成する
// =====================================================

/** 1 行目の user@host */
export const heroUser = { user: "toramutton", host: "toramutton.me" };

// ---- USER セクション ----
export type HeroSpec =
  | {
      key: string;
      icon: Icon;
      kind?: "text";
      value: string;
      /** true にするとアクセント色の点が脈打つ */
      live?: boolean;
      /** true にすると値クリックで全文をクリップボードにコピーする */
      copy?: boolean;
    }
  | {
      key: string;
      icon: Icon;
      /** JST の現在時刻を秒ごとに更新する */
      kind: "clock";
    };

export const heroSpecs: HeroSpec[] = [
  { key: "Name", icon: User, value: "トラマト / 寅松 / toramutton" },
  { key: "Univ", icon: GraduationCap, value: "UEC25 Class A" },
  { key: "Stack", icon: Layers, value: "Rust / TS / C" },
  {
    key: "UUID",
    icon: Fingerprint,
    value: "1b45a0db-7238-47e4-b95e-206522388c88",
    copy: true,
  },
  // 今やっていること。気が向いたら書き換える
  { key: "Now", icon: Activity, value: "Rust勉強中", live: true },
  { key: "Time", icon: Clock, kind: "clock" },
];

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
  { name: "note", url: NOTE_URL, icon: "note" },
  { name: "Qiita", url: QIITA_URL, icon: "qiita" },
  { name: "Twitter", url: TW_DAILY_URL, icon: "twitter" },
];

// ---- PALETTE セクション ----
// サイトの CSS 変数名。ライト/ダークで自動的に切り替わる
export const heroPalette: string[] = [
  "--accent-blue",
  "--accent-secondary",
  "--brand-zenn",
  "--brand-note",
  "--brand-qiita",
  "--text-main",
  "--text-muted",
  "--border-color",
];

// =====================================================
// ヒーロー左側のミニターミナル
// 表示のたびに、この中からランダムで3行が選ばれる
// =====================================================
export interface TerminalCommand {
  cmd: string;
  out: string;
}

export const terminalCommands: TerminalCommand[] = [
  { cmd: "whoami", out: "toramutton" },
  { cmd: "status", out: "studying" },
  { cmd: "mood", out: "creating something" },
  { cmd: "cat major", out: "CS @ UEC" },
  { cmd: "cat os", out: "Arch Linux / Windows 11" },
  { cmd: "echo $SHELL", out: "/bin/bash" },
  { cmd: "cat hobby", out: "Twitter / Anime / Music" },
  { cmd: "git status", out: "on branch: main" },
  { cmd: "pwd", out: "/home/toramutton" },
  { cmd: "echo $LANG", out: "ja_JP.UTF-8" },
  { cmd: "cat skills", out: "Rust / TypeScript / C" },
  { cmd: "cat editor", out: "Zed" },
  { cmd: "echo $WM", out: "Hyprland / GlazeWM" },
  { cmd: "cat focus", out: "web / compilers / LLM" },
  { cmd: "fortune", out: "多分動くと思うからリリースしようぜ" },
  { cmd: "cat music", out: "米津玄師 / Eve / ヨルシカ" },
  { cmd: "ping life", out: "64 bytes: icmp_seq=1 ttl=64" },
  { cmd: "cat dream", out: "living happy!" },
  { cmd: "cat gpa", out: "it's fine" },
  { cmd: "cat sleep", out: "insufficient" },
  { cmd: "git log --oneline", out: "abc1234 fix: everything" },
  { cmd: "cat arch", out: "I use Arch btw" },
  { cmd: "cat bugs", out: "feature" },
  { cmd: "sudo make me a sandwich", out: "Okay." },
  {
    cmd: "rm -rf laziness",
    out: "Permission denied: It's part of your identity",
  },
  { cmd: "cat motivation", out: "depends on the day" },
  { cmd: "uptime", out: "2 years at UEC" },
  { cmd: "ls projects", out: "too many" },
  { cmd: "man life", out: "No manual entry for life" },
  { cmd: "cat girlfriend", out: "404 Not Found" },
  { cmd: "cat regrets", out: "3DS" },
  { cmd: "git diff lunch", out: "no changes. still udon." },
  { cmd: "locate meme", out: "found before you finished asking" },
  { cmd: "which interest", out: "ask me again next month" },
  { cmd: "gcc exam.c", out: "Please use a pencil." },
  { cmd: "sudo reboot", out: "please come back" },
  { cmd: "cat day.conf", out: "hours = 27 # powered by Gemini" },
];

// =====================================================
// Countdown カード
// 残り日数はブラウザ側で毎秒計算されるので、日付だけ書けばいい
// =====================================================
export interface Mission {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  icon: Icon;
}

export const missions: Mission[] = [
  { title: "夏休み", date: "2026-09-30", icon: ThermometerSun },
  { title: "2026 TOUR / GHOST", date: "2026-11-12", icon: Music },
  { title: "2026年終了", date: "2026-12-31", icon: Milestone },
  { title: "2年後期", date: "2027-02-13", icon: ShieldCheck },
  { title: "21歳の誕生日", date: "2027-06-20", icon: Cake },
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
