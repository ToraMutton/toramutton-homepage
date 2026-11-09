// /lab/room/ の試作で使う「部屋の設定」。座標・視点・色の調整はこのファイルだけ触ればいい。
//
// ここからは何も import しない。works.ts / about.ts は lucide-astro や画像を読み込むので、
// ブラウザ側の 3D コードへ持ち込むと壊れる。作品名などの中身は RoomContent.astro が
// HTML に出し、3D 側はその HTML から受け取る。

export const SECTION_IDS = [
  "home",
  "about",
  "works",
  "skills",
  "library",
  "pc",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];
export type StageStatus = "static" | "loading" | "ready" | "error";
export type SelectionSource = "scroll" | "nav" | "scene" | "history";
export type RoomTheme = "light" | "dark";

export interface RoomState {
  activeSection: SectionId;
  selectedDetail: string | null;
  stageStatus: StageStatus;
  theme: RoomTheme;
  reducedMotion: boolean;
}

export const isSectionId = (value: string): value is SectionId =>
  (SECTION_IDS as readonly string[]).includes(value);

/** ヘッダーのナビに出す名前。 */
export const SECTION_LABELS: Record<SectionId, string> = {
  home: "Room",
  about: "About",
  works: "Works",
  skills: "Skills",
  library: "Library",
  pc: "PC",
};

/** これ以上の幅で左右分割、未満は静止画＋縦並び。CSS の @media も同じ値にする。 */
export const ROOM_SPLIT_MIN_WIDTH = 960;

export const ROOM_RENDER = {
  /** 物理解像度をそのまま使うと重いので上限を置く */
  maxPixelRatio: 1.5,
  /** 章の移動にかける秒数 */
  transitionSeconds: 0.6,
  /** 机の下へ回り込むときは距離が長いので少し伸ばす */
  relayTransitionSeconds: 0.95,
} as const;

// =====================================================
// 部屋の配置（単位はメートル相当、Y 上向き、床上面が y=0）
//   奥壁 -Z / 右壁 +X / カメラは -X, +Y, +Z 側から見る
// 仮組みの値であり、実寸の主張ではない。
// =====================================================
export type Vec3 = readonly [number, number, number];

export interface Placement {
  /** 中心位置 */
  position: Vec3;
  /** 幅(x) / 高さ(y) / 奥行(z) */
  size: Vec3;
}

export const ROOM_LAYOUT = {
  floor: { position: [0, -0.04, -0.15], size: [4.4, 0.08, 2.9] },
  wallBack: { position: [0, 1.05, -1.6], size: [4.4, 2.1, 0.12] },
  wallRight: { position: [2.2, 1.05, -0.15], size: [0.12, 2.1, 2.9] },
  carpet: { position: [-0.22, 0.006, 0.08], size: [2.9, 0.012, 1.98] },
  deskTop: { position: [-0.3, 0.75, -0.9], size: [3.5, 0.06, 0.8] },
  monitorMain: { position: [-0.38, 1.25, -1.12], size: [1.24, 0.775, 0.02] },
  monitorSub: { position: [-1.5, 1.37, -1.14], size: [0.6, 1.12, 0.05] },
  keyboard: { position: [-0.42, 0.8, -0.66], size: [0.52, 0.04, 0.18] },
  pcCase: { position: [0.85, 0.32, -0.58], size: [0.36, 0.64, 0.6] },
  bookshelf: { position: [1.9, 0.5, 0.15], size: [0.4, 1.0, 1.2] },
  chair: { position: [-0.4, 0.58, 0.38], size: [0.76, 1.16, 0.7] },
  nameplate: { position: [0.62, 0.815, -0.92], size: [0.26, 0.07, 0.06] },
  iconFrame: { position: [0.64, 0.905, -1.14], size: [0.2, 0.25, 0.03] },
} as const satisfies Record<string, Placement>;

// =====================================================
// 視点
//   fov      : 縦画角の基本値
//   minHFov  : 横画角の下限。縦長の canvas では fov を広げて対象の左右を切らさない
//              （カメラを引くと家具に潜るので、位置は動かさず画角で吸収する）
// =====================================================
export interface Viewpoint {
  position: Vec3;
  lookAt: Vec3;
  fov: number;
  minHFov: number;
}

export const VIEWPOINTS: Record<SectionId, Viewpoint> = {
  // 参考画像の線の傾きから逆算した俯角 32°・方位 29°
  home: {
    position: [-4.45, 6.85, 8.35],
    lookAt: [0.3, 0.42, -0.02],
    fov: 24.5,
    minHFov: 32,
  },
  // どれも対象だけでなく、周りの机や壁が少し残る距離にする
  about: {
    position: [0.3, 1.42, 0.05],
    lookAt: [0.68, 0.87, -1.02],
    fov: 32,
    minHFov: 40,
  },
  works: {
    position: [-1.02, 1.6, 1.62],
    lookAt: [-0.5, 1.12, -1.1],
    fov: 32,
    minHFov: 34,
  },
  skills: {
    position: [-0.62, 1.56, 0.12],
    lookAt: [-0.4, 0.8, -0.72],
    fov: 32,
    minHFov: 40,
  },
  library: {
    position: [0.32, 1.02, 0.5],
    lookAt: [1.8, 0.5, 0.16],
    fov: 34,
    minHFov: 50,
  },
  pc: {
    position: [-0.06, 0.42, -0.1],
    lookAt: [0.82, 0.38, -0.6],
    fov: 52,
    minHFov: 52,
  },
};

/** 椅子と机の間を抜けるための中継点。机の下へ入るときも出るときもここを通る。 */
export const PC_RELAY: Vec3 = [0.6, 0.92, 1.05];

/** 机の前の低い場所にいるか。ここから動くときは中継点を経由しないと椅子に当たる。 */
export const isUnderDeskZone = ([x, y, z]: Vec3): boolean =>
  y < 0.98 && z < 1.0 && x > -1.2 && x < 1.6;

/** 2 点を結ぶ直線が椅子を横切るか。割り込まれた途中の地点からでも使える */
function crossesChair(from: Vec3, to: Vec3): boolean {
  const { position, size } = ROOM_LAYOUT.chair;
  const margin = 0.03;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const inside = [0, 1, 2].every((axis) => {
      const value = from[axis] + (to[axis] - from[axis]) * t;
      return Math.abs(value - position[axis]) < size[axis] / 2 + margin;
    });
    if (inside) return true;
  }
  return false;
}

/** 現在位置から視点までの通過点。カメラと検証の両方で同じ経路を使う。 */
export function routeTo(from: Vec3, target: SectionId): Vec3[] {
  const destination = VIEWPOINTS[target].position;
  const fromLow = isUnderDeskZone(from);
  const targetLow = isUnderDeskZone(destination);
  // 低い場所どうしの移動（割り込みで PC へ戻るなど）は回り道しない
  return fromLow !== targetLow || crossesChair(from, destination)
    ? [from, PC_RELAY, destination]
    : [from, destination];
}

/**
 * 視点の縦画角を、canvas の縦横比に合わせて求める。
 * 横画角が minHFov を下回るときだけ縦画角を広げる。
 */
export function fitFov(view: Viewpoint, aspect: number): number {
  const halfH = (view.minHFov * Math.PI) / 360;
  const needed = (2 * Math.atan(Math.tan(halfH) / aspect) * 180) / Math.PI;
  return Math.max(view.fov, needed);
}

// =====================================================
// 選べる物
// =====================================================

/** 全景でも選べる、章に対応する物。group は 3D 側のグループ名。 */
export const SECTION_TARGETS: {
  section: Exclude<SectionId, "home">;
  groups: string[];
  label: string;
}[] = [
  { section: "about", groups: ["profile_nameplate"], label: "名札" },
  { section: "about", groups: ["profile_icon_frame"], label: "写真立て" },
  { section: "works", groups: ["monitor_main"], label: "メインモニター" },
  { section: "skills", groups: ["keyboard"], label: "キーボード" },
  { section: "library", groups: ["bookshelf"], label: "本棚" },
  { section: "pc", groups: ["pc_case"], label: "PC" },
];

/** 章へ寄った後で選ぶ細部。id は HTML 側の data-room-detail と揃える。 */
export const DETAIL_TARGETS: {
  id: string;
  section: SectionId;
  group: string | null;
  label: string;
}[] = [
  { id: "artoram", section: "works", group: null, label: "ArToram" },
  { id: "vextra", section: "works", group: null, label: "Vextra" },
  { id: "rust", section: "skills", group: "key_rust", label: "Rust" },
  { id: "typescript", section: "skills", group: "key_typescript", label: "TypeScript" },
  { id: "c", section: "skills", group: "key_c", label: "C" },
  { id: "guide", section: "library", group: "book_guide", label: "制作ガイド" },
  { id: "pc-build", section: "library", group: "book_pc_build", label: "自作PCの話" },
  { id: "uec-review", section: "library", group: "book_uec_review", label: "電通大1年の振り返り" },
  { id: "gpu", section: "pc", group: "pc_gpu", label: "GPU" },
  { id: "memory", section: "pc", group: "pc_memory", label: "メモリ" },
  { id: "cooler", section: "pc", group: "pc_cpu_cooler", label: "CPUクーラー" },
];

// =====================================================
// 色（参考画像の色味に寄せる。暗いテーマでも黒つぶれさせない）
// =====================================================
export const ROOM_MATERIAL_KEYS = [
  "wallBack",
  "wallRight",
  "wallRim",
  "floor",
  "carpet",
  "desk",
  "black",
  "charcoal",
  "gray",
  "metal",
  "paper",
  "board",
  "leaf",
  "pot",
  "keyAccent",
  "bookA",
  "bookB",
  "bookC",
  "bookD",
  "floorLine",
  "leafDark",
] as const;

export type RoomMaterialKey = (typeof ROOM_MATERIAL_KEYS)[number];

export interface RoomPalette {
  background: string;
  ambient: number;
  sun: number;
  /** 影の濃さ(0〜1) */
  shadow: number;
  /** 接地影の濃さの倍率 */
  contact: number;
  colors: Record<RoomMaterialKey, string>;
}

export const ROOM_PALETTES: Record<RoomTheme, RoomPalette> = {
  light: {
    background: "#2f2d52",
    ambient: 1.75,
    sun: 1.55,
    shadow: 0.5,
    contact: 1,
    colors: {
      wallBack: "#d8cdcb",
      wallRight: "#7da5a4",
      wallRim: "#f5e9e5",
      floor: "#e4bf9b",
      carpet: "#6f6d84",
      desk: "#3b3a40",
      black: "#2a2a30",
      charcoal: "#45454d",
      gray: "#8e8e96",
      metal: "#bcbfc6",
      paper: "#efebe3",
      board: "#274745",
      leaf: "#5fa03f",
      pot: "#e3d9c6",
      keyAccent: "#1f7c8c",
      bookA: "#e9e6df",
      bookB: "#b4c0c4",
      bookC: "#7f9aa1",
      bookD: "#56707a",
      floorLine: "#cfa780",
      leafDark: "#467f30",
    },
  },
  dark: {
    background: "#1c1b35",
    ambient: 1.3,
    sun: 1.25,
    shadow: 0.42,
    contact: 0.8,
    colors: {
      wallBack: "#938a9d",
      wallRight: "#527c84",
      wallRim: "#c4bbc8",
      floor: "#ae8f75",
      carpet: "#5c5a76",
      desk: "#46454f",
      black: "#35353f",
      charcoal: "#51515d",
      gray: "#8a8a96",
      metal: "#adb0b9",
      paper: "#cfcbcb",
      board: "#2f5758",
      leaf: "#548f3f",
      pot: "#b8ae9d",
      keyAccent: "#2b8f9e",
      bookA: "#ccc9c9",
      bookB: "#a3afb6",
      bookC: "#7f99a1",
      bookD: "#5f7c86",
      floorLine: "#967a63",
      leafDark: "#3d7230",
    },
  },
};

export const ROOM_CYAN = "#22d3ee";
