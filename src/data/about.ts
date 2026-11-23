// プロフィール系の内容。トップの About セクション(src/components/home/AboutSection.astro)と、
// Aboutページ（src/pages/about.astro）の両方が読む。
// 技術スタック・趣味・使っている機材・経歴を、ここだけ触れば増やせるようにしてある。

// =====================================================
// プロフィール(名前・所属など)
// =====================================================
export const PROFILE = {
  handle: "toramutton",
  kana: "トラマト",
  kanji: "寅松",
  univ: "電気通信大学 情報理工学域 I類",
  program: "CS Program",
  /** 入学年度つきの略称 */
  univShort: "UEC25",
  club: "MMA",
  mbti: "INTJ-A",
  /** 先輩からもらった大切な UUID。トップのヒーローと About で使う(クリックでコピー) */
  uuid: "1b45a0db-7238-47e4-b95e-206522388c88",
} as const;

// =====================================================
// スキル(厳選 16 個。熟練度は付けない)
// =====================================================
// アイコンは public/icons/skills/ の単色 SVG(Simple Icons / CC0。ROCm だけ public/icons/rocm.svg)。
// 色は CSS の mask で塗るので、テーマの色にそのまま追従する。
export interface FeaturedSkill {
  name: string;
  /** public からのパス */
  icon: string;
}

const si = (file: string) => `/icons/skills/${file}.svg`;

/** 並び順がそのまま画面の並び(8 × 2)。言語 → Web → 基盤 → ツール */
export const FEATURED_SKILLS: FeaturedSkill[] = [
  { name: "C", icon: si("c") },
  { name: "Rust", icon: si("rust") },
  { name: "Ruby", icon: si("ruby") },
  { name: "JavaScript", icon: si("javascript") },
  { name: "TypeScript", icon: si("typescript") },
  { name: "HTML", icon: si("html5") },
  { name: "CSS", icon: si("css") },
  { name: "React", icon: si("react") },
  { name: "Astro", icon: si("astro") },
  { name: "Qt", icon: si("qt") },
  { name: "ROCm", icon: "/icons/rocm.svg" },
  { name: "Zed", icon: si("zedindustries") },
  { name: "Git", icon: si("git") },
  { name: "GitHub", icon: si("github") },
  { name: "LaTeX", icon: si("latex") },
  { name: "Arch Linux", icon: si("archlinux") },
];

// ---- ここから下のスキル(34 個・熟練度つき)は、/about を作り直すまでの旧データ ----
// 作り直したら、上の FEATURED_SKILLS に一本化して、この下のスキル関連(SKILL_* / *_SKILLS / devicon)を消す。

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
  { name: "Zed", src: "/icons/zed.svg", level: 5, darkInvert: true },
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
    items: ["Minecraft", "Splatoon", "Pokémon"],
  },
  { section: "other", items: ["Twitter", "キヨ。"] },
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
      { k: "os", v: "Windows 11 Home　& Arch Linux" },
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
// 資格
// =====================================================
// 増えたらここに 1 行足すだけでいい。取得した日の「合格」が、下の TIMELINE にも自動で入る。
export interface Qualification {
  id: string;
  name: string;
  /** 取得日 YYYY.MM.DD */
  date: string;
}

export const QUALIFICATIONS: Qualification[] = [
  { id: "fe", name: "基本情報技術者試験", date: "2026.03.10" },
];

// =====================================================
// 経歴（git log 風 / 新しいものが上）
// =====================================================
export interface TimelineEntry {
  /** YYYY.MM.DD */
  date: string;
  desc: string;
  /** true なら日付は年だけ出す(誕生日を出したくない項目用) */
  yearOnly?: boolean;
  /** 資格の取得を表す項目(QUALIFICATIONS の id) */
  qualification?: string;
}

/** 資格以外の出来事。順不同でよい(下で日付順に並べる) */
const EVENTS: TimelineEntry[] = [
  { date: "2026.09.25", desc: "コンピュータサイエンスプログラム 配属" },
  { date: "2026.09.12", desc: "ノートPCにArch Linuxを導入" },
  { date: "2026.08.14", desc: "デスクトップシェルをCaelestia Shellへ移行" },
  { date: "2026.05.30", desc: "ホームページをターミナル風デザインに大改造" },
  { date: "2026.04.24", desc: "UEC Career Boot Festa 2026 のNOCに参加" },
  { date: "2026.02.15", desc: "自作PCにArch Linuxを導入" },
  { date: "2026.02.13", desc: "自作PCをビルド" },
  { date: "2026.01.02", desc: "このホームページを開設" },
  { date: "2025.04.14", desc: "電気通信大学 MMA 入部" },
  { date: "2025.04.04", desc: "電気通信大学 I類 入学" },
  { date: "2006.06.20", desc: "誕生", yearOnly: true },
];

export const TIMELINE: TimelineEntry[] = [
  ...EVENTS,
  ...QUALIFICATIONS.map((q) => ({
    date: q.date,
    desc: `${q.name} 合格`,
    qualification: q.id,
  })),
].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
