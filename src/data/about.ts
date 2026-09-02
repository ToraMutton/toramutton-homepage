// Aboutページ（src/pages/about.astro）に出す内容。
// 技術スタック・趣味・使っている機材・経歴を、ここだけ触れば増やせるようにしてある。

/**
 * devicon のアイコンURLを組み立てる。
 * https://devicon.dev で使いたいアイコンを探して、フォルダ名を渡すだけでいい。
 * 例: devicon("rust") → .../icons/rust/rust-original.svg
 */
const devicon = (dir: string) =>
  `https://cdn.jsdelivr.net/gh/devicons/devicon/icons/${dir}/${dir}-original.svg`;

/** 熟練度。5 が一番できる。意味は下の SKILL_LEVELS を参照 */
export type SkillLevel = 1 | 2 | 3 | 4 | 5;

/** 凡例。Aboutページの Skills & Tools 見出し下に出る */
export const SKILL_LEVELS: { level: SkillLevel; label: string }[] = [
  { level: 5, label: "つよつよ" },
  { level: 4, label: "それなり" },
  { level: 3, label: "まぁまぁ" },
  { level: 2, label: "触った" },
  { level: 1, label: "入門中" },
];

export interface Skill {
  name: string;
  /** devicon("...") か、/icons/ 配下のパスか、直URL */
  src: string;
  /** 熟練度 5〜1。カード下の5分割メーターになる */
  level: SkillLevel;
  /** ダークモードで白黒反転させる（黒一色のロゴ向け） */
  darkInvert?: boolean;
}

// --- 1. Languages ---
export const LANGUAGE_SKILLS: Skill[] = [
  { name: "C", src: devicon("c"), level: 4 },
  { name: "C++", src: devicon("cplusplus"), level: 2 },
  { name: "C#", src: devicon("csharp"), level: 2 },
  { name: "Rust", src: devicon("rust"), level: 3, darkInvert: true },
  { name: "Java", src: devicon("java"), level: 2 },
  { name: "Python", src: devicon("python"), level: 3 },
  { name: "Ruby", src: devicon("ruby"), level: 2 },
  { name: "Lua", src: devicon("lua"), level: 2 },
  { name: "Bash", src: devicon("bash"), level: 3, darkInvert: true },
  { name: "JavaScript", src: devicon("javascript"), level: 4 },
  { name: "TypeScript", src: devicon("typescript"), level: 4 },
  // Caelestia / Quickshell
  { name: "QML", src: devicon("qt"), level: 1 },
];

// --- 2. Web ---
export const WEB_SKILLS: Skill[] = [
  { name: "HTML", src: devicon("html5"), level: 4 },
  { name: "CSS", src: devicon("css3"), level: 4 },
  { name: "React", src: devicon("react"), level: 3 },
  { name: "Astro", src: devicon("astro"), level: 4, darkInvert: true },
  { name: "Vite", src: devicon("vitejs"), level: 2 },
];

// --- 3. Desktop & Ricing ---
export const DESKTOP_SKILLS: Skill[] = [
  { name: "Qt", src: devicon("qt"), level: 1 },
  { name: "Qt Quick", src: devicon("qt"), level: 1 },
  {
    name: "Quickshell",
    src: "/icons/quickshell.svg",
    level: 1,
    darkInvert: true,
  },
];

// --- 4. AI & Compute ---
export const AI_SKILLS: Skill[] = [
  { name: "ROCm", src: "/icons/rocm.svg", level: 2, darkInvert: true },
  { name: "Ollama", src: "/icons/ollama.svg", level: 2, darkInvert: true },
];

// --- 5. Tools & Creative ---
export const TOOL_SKILLS: Skill[] = [
  {
    name: "Zed",
    src: "https://zed.dev/_next/static/media/logo-new-white.0gnyg5qr0_x6r.png",
    level: 5,
  },
  { name: "Neovim", src: devicon("neovim"), level: 3 },
  { name: "VS Code", src: devicon("vscode"), level: 3 },
  { name: "IntelliJ", src: devicon("intellij"), level: 2 },
  { name: "Git", src: devicon("git"), level: 3 },
  { name: "GitHub", src: devicon("github"), level: 3, darkInvert: true },
  { name: "Docker", src: devicon("docker"), level: 2 },
  { name: "Vercel", src: devicon("vercel"), level: 3 },
  { name: "LaTeX", src: devicon("latex"), level: 4 },
  { name: "Blender", src: devicon("blender"), level: 3 },
];

// --- 6. Operating Systems ---
export const OS_SKILLS: Skill[] = [
  { name: "Windows", src: devicon("windows8"), level: 3 },
  { name: "Arch Linux", src: devicon("archlinux"), level: 4, darkInvert: true },
];

/** 上のグループを画面に並べる順番。グループごと足したいときはここに1行足す */
export interface SkillGroup {
  /** ターミナル風に表示されるコマンド行 */
  cmd: string;
  /** 見出し */
  note: string;
  items: Skill[];
}

export const SKILL_GROUPS: SkillGroup[] = [
  { cmd: "ls ./languages", note: "Languages", items: LANGUAGE_SKILLS },
  { cmd: "ls ./web", note: "Web", items: WEB_SKILLS },
  { cmd: "ls ./desktop", note: "Desktop & Ricing", items: DESKTOP_SKILLS },
  { cmd: "ls ./ai", note: "AI & Compute", items: AI_SKILLS },
  { cmd: "ls ./tools", note: "Tools & Creative", items: TOOL_SKILLS },
  { cmd: "ls ./os", note: "Operating Systems", items: OS_SKILLS },
];

// =====================================================
// 趣味
// =====================================================
export interface Interest {
  section: string;
  items: string[];
}

export const INTERESTS: Interest[] = [
  { section: "music", items: ["米津玄師", "Eve", "ヨルシカ"] },
  {
    section: "game",
    items: ["Minecraft", "Splatoon", "Blue Archive", "Pokémon"],
  },
  { section: "other", items: ["Twitter", "アニメ", "睡眠", "キヨ。"] },
];

// =====================================================
// 環境（dotfile 風の表示）
// =====================================================
export interface EnvBlock {
  section: string;
  /** 機材名と使用開始日。省略可 */
  meta?: string;
  /** k = 項目名, v = 中身 */
  rows: { k: string; v: string }[];
  /** ブロックの下に出す関連リンク。省略可 */
  link?: { cmd: string; href: string; tag: string };
}

export const ENV_BLOCKS: EnvBlock[] = [
  {
    section: "desktop",
    meta: "Torapezium-08 : 2026/02/13 ~",
    rows: [
      { k: "cpu", v: "AMD Ryzen 7 7700" },
      { k: "gpu", v: "Radeon RX 9060 XT 16GB" },
      { k: "mb", v: "ASUS A620M-K CSM" },
      { k: "memory", v: "DDR5 32GB" },
      { k: "storage", v: "SSD 2TB (NVMe)" },
      { k: "cooler", v: "虎徹 MarkⅡ" },
      { k: "case", v: "MONTECH AIR 903 MAX" },
      { k: "psu", v: "玄人志向 80PLUS Platinum 600W" },
      { k: "os", v: "Windows 11 Home & Arch Linux" },
    ],
    link: {
      cmd: "cd ./desktop && cat pc-build-2026.md",
      href: "/blog/pc-build-2026/",
      tag: "より詳しい情報はこちら",
    },
  },
  {
    section: "laptop",
    meta: "Dell 14 Plus : 2025/03/28 ~",
    rows: [
      { k: "cpu", v: "Core Ultra 7 258V" },
      { k: "gpu", v: "Intel Arc Graphics 140V" },
      { k: "memory", v: "32GB (MoP / LPDDR5x-8533)" },
      { k: "os", v: "Windows 11 Home" },
    ],
  },
  {
    section: "mobile",
    rows: [
      { k: "phone", v: "iPhone 16e" },
      { k: "tablet", v: "iPad Air M4" },
    ],
  },
  {
    section: "setup",
    rows: [
      { k: "monitor.main", v: "24-inch WQHD 180Hz" },
      { k: "monitor.sub", v: "27-inch WQHD 75Hz" },
      { k: "editor", v: "Zed" },
      { k: "browser", v: "Google Chrome" },

      { k: "linux.wm", v: "Hyprland" },
      { k: "linux.shell", v: "Caelestia Shell" },

      { k: "windows.wm", v: "GlazeWM" },
      { k: "windows.bar", v: "Zebar" },
    ],
  },
];

// =====================================================
// 経歴（git log 風 / 新しいものが上）
// =====================================================
export interface TimelineEntry {
  /** YYYY.MM.DD */
  date: string;
  desc: string;
}

export const TIMELINE: TimelineEntry[] = [
  { date: "2026.08.14", desc: "デスクトップシェルをCaelestia Shellへ移行" },
  { date: "2026.05.30", desc: "ホームページをターミナル風デザインに大改造" },
  { date: "2026.04.24", desc: "UEC Career Boot Festa 2026のNOCに参加" },
  { date: "2026.03.10", desc: "基本情報技術者試験 合格" },
  { date: "2026.01.02", desc: "Astroでホームページを作成" },
  { date: "2025.04.14", desc: "MMA 入部" },
  { date: "2025.04.04", desc: "電気通信大学Ⅰ類 入学" },
  { date: "2022.04.07", desc: "都立三田高校 入学" },
  { date: "2006.06.20", desc: "誕生" },
];
