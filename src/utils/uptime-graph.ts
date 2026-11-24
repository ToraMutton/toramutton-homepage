// Uptime カードの背景グラフ(Uptime Kuma の応答時間グラフ風の折れ線)を、数値から決定論的に作る。
// ビルド時(Astro の frontmatter)とブラウザ側(<script>)の両方から使う。
//
// 同じ数値(= 同じ日)からは必ず同じ折れ線ができ、翌日は日数が変わるので別の折れ線になる。
// 乱数は、種(シード)から同じ列を吐き出す mulberry32 という小さな疑似乱数を使う
// (Math.random() だと、ビルドのたびにも、読み込みのたびにも形が変わってしまう)。

/** 種から [0, 1) の乱数列を作る(mulberry32) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 複数の自然数を 1 つの種にまとめる(FNV-1a) */
export function seedFrom(...nums: number[]): number {
  let h = 2166136261;
  for (const n of nums) {
    h ^= n;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface UptimeGraph {
  /** 折れ線(SVG path の d) */
  line: string;
  /** 折れ線の下を塗る領域(SVG path の d) */
  area: string;
  /** いちばん右(いま)の点 */
  last: { x: number; y: number };
}

/**
 * 幅 w・高さ h の中に収まる折れ線を作る。
 * ゆるやかなうねり(2 つの sin の重ね合わせ)に、小さなノイズと、ときどきのスパイクを足している。
 */
export function uptimeGraph(seed: number, w = 300, h = 100, points = 44): UptimeGraph {
  const rand = mulberry32(seed);
  const phase1 = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;
  const coords: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const wave = 0.3 + 0.1 * Math.sin(i * 0.35 + phase1) + 0.06 * Math.sin(i * 0.9 + phase2);
    const noise = (rand() - 0.5) * 0.12;
    const spike = rand() < 0.12 ? 0.25 + rand() * 0.45 : 0;
    const v = Math.min(0.95, Math.max(0.05, wave + noise + spike));
    coords.push([(i / (points - 1)) * w, h - 4 - v * (h - 8)]);
  }
  const f = (n: number) => n.toFixed(1);
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join(" ");
  const [lx, ly] = coords[coords.length - 1];
  return { line, area: `${line} L${f(w)} ${h} L0 ${h} Z`, last: { x: lx, y: ly } };
}
