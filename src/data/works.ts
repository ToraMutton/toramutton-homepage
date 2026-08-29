// Worksページ（src/pages/works.astro）に並べる作品。
//
// 作品を足すときは、下の works 配列に1つオブジェクトを足すだけでいい。
// status によって「完成」「制作中」「構想中」のどのセクションに出るかが決まる。
//
// スクリーンショットを付けるなら src/assets/works/ に画像を置き、
// このファイルの先頭で import してから image に渡す（Astro が自動で圧縮してくれる）。
// アイコンは https://lucide.dev で名前を探して import に足す。

import type { ImageMetadata } from "astro";

import archdotImage from "../assets/works/arch.webp";
import artoramImage from "../assets/works/artoram.webp";
import fxtwitterImage from "../assets/works/fxtwitter-bot.webp";
import homepageImage from "../assets/works/toramutton.webp";
import nexusImage from "../assets/works/nexus.webp";
import vextraImage from "../assets/works/vextra.webp";
import windotImage from "../assets/works/windotfiles.webp";

import {
  Chrome,
  Code2,
  Cpu,
  FileVideo,
  Gamepad2,
  Grid3X3,
  LayoutGrid,
  Shapes,
  Terminal,
} from "lucide-astro";

export interface Work {
  name: string;
  description: string;
  /** 公開URL。無ければ省略 */
  url?: string;
  /** ソースコード。無ければ省略 */
  github?: string;
  tags: string[];
  icon: typeof Code2;
  year: string;
  status: "completed" | "in-progress" | "planned";
  image?: ImageMetadata;
}

export const works: Work[] = [
  {
    name: "ToraMutton's Homepage",
    description:
      "Astro + Vercelで構築したこのサイトです。note/Zenn/Qiitaの記事をビルド時に取得し、GitHub ActionsからVercelを毎日自動リビルド。最近デザインも一新しました。",
    url: "https://toramutton.me",
    github: "https://github.com/ToraMutton/toramutton-homepage",
    tags: ["Astro", "TypeScript", "Vercel"],
    icon: Code2,
    year: "2026",
    status: "completed",
    image: homepageImage,
  },
  {
    name: "Arch Linux Dotfiles",
    description:
      "HyprlandとCaelestia Shellを中心に構築したArch Linuxのdotfiles。Hyprlandの設定はLuaで分割管理し、GNU Stowでホームディレクトリへ展開しています。",
    tags: ["Linux", "Hyprland", "Caelestia"],
    icon: Terminal,
    year: "2026",
    url: "",
    github: "https://github.com/ToraMutton/dotfiles/tree/main/arch",
    status: "completed",
    image: archdotImage,
  },
  {
    name: "ArToram",
    description:
      "20種類の描画アルゴリズムを備えた幾何学アートジェネレーター。数式パラメータや配色をリアルタイムで調整し、FHD・WQHD・4Kなどの高解像度画像として保存できます。",
    tags: ["TypeScript", "Canvas API", "React"],
    icon: Shapes,
    year: "2026",
    url: "https://artoram.toramutton.me",
    github: "https://github.com/ToraMutton/artoram",
    status: "completed",
    image: artoramImage,
  },
  {
    name: "Vextora",
    description:
      "ブラウザ上で完結するMinecraftスキンエディター。Three.jsによるリアルタイム3Dプレビューとピクセル単位のペイント機能、オートセーブ機能付き。",
    tags: ["TypeScript", "Three.js", "React"],
    icon: Gamepad2,
    year: "2026",
    url: "https://vextra.toramutton.me/",
    github: "https://github.com/ToraMutton/minecraft-skin-editor",
    status: "completed",
    image: vextraImage,
  },
  {
    name: "Windows11 Dotfiles",
    description:
      "GlazeWMとzebarを用いた、タイル型ウィンドウマネージャ環境のWindows11用設定ファイル。Reactを用いたバーカスタマイズが可能です。",
    tags: ["GlazeWM", "zebar", "React"],
    icon: LayoutGrid,
    year: "2026",
    url: "",
    github: "https://github.com/ToraMutton/dotfiles/tree/main/windows",
    status: "completed",
    image: windotImage,
  },
  {
    name: "fxtwitter-bot",
    description:
      "Rust製の動画保存用discord-bot。ツイートのリンクを送るだけで、正規表現を用いて保存可能なリンクに書き換えます。",
    tags: ["fly.io", "Rust", "Docker"],
    icon: FileVideo,
    year: "2026",
    url: "",
    github: "",
    status: "completed",
    image: fxtwitterImage,
  },
  {
    name: "NEXUS for UEC",
    description:
      "電通大生向け時間割アプリ。チームbookmarkの一員として頑張っております。電通大生全員インストールして！！！",
    tags: ["Swift", "Kotlin", "Firebase"],
    icon: Grid3X3,
    year: "2026",
    url: "https://nexusforuec.team-bookmark.com/",
    github: "https://github.com/shiori-02-14/NEXUS-",
    status: "completed",
    image: nexusImage,
  },
  {
    name: "Classroom-PDF-Saver",
    description:
      "Google ClassroomのPDF保存を時短させるChrome拡張機能です。わざわざ新しいタブで開く必要なし！",
    tags: ["Javascript", "拡張機能"],
    icon: Chrome,
    year: "2026",
    url: "",
    github: "https://github.com/ToraMutton/classroom-pdf-saver",
    status: "completed",
  },
  {
    name: "TORANOI",
    description:
      "AMD Radeon RX 9060 XT 16GBとROCmを活用し、Ollamaを中心としたローカルLLM環境と独自チャットUIを構築するプロジェクト。",
    tags: ["Python", "ROCm", "LLM"],
    icon: Cpu,
    year: "2026",
    github: "https://github.com/ToraMutton/local-ai-rocm",
    status: "in-progress",
  },
  {
    name: "ネタプログラミング言語",
    description:
      "Go言語による自作プログラミング言語の開発。字句解析・構文解析といった言語処理系の仕組みを学ぶための、実用性皆無なネタ言語。",
    tags: ["Go", "Compiler", ".trmt"],
    icon: Terminal,
    year: "2027予定",
    status: "planned",
  },
];
