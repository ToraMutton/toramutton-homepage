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
  /** 所属。トップの About とフッターで同じ表記を使う(入学年度 - プログラム) */
  univ: "UEC25 - Computer Science Program",
  club: "MMA",
  mbti: "INTJ-A",
  /** 誕生日 YYYY-MM-DD。年齢は utils/age.ts で、JST の今日から数える */
  birthday: "2006-06-20",
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
  { name: "CSS", icon: si("css3") },
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
      { k: "os", v: "Windows 11 Home & Arch Linux" },
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
  { date: "2025.04.04", desc: "電気通信大学 入学" },
  { date: "2006.06.20", desc: "誕生" },
];

export const TIMELINE: TimelineEntry[] = [
  ...EVENTS,
  ...QUALIFICATIONS.map((q) => ({
    date: q.date,
    desc: `${q.name} 合格`,
    qualification: q.id,
  })),
].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
