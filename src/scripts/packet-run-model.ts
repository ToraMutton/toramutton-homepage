// 404 のミニゲームのルール。画面には一切触らない(描画と入力は packet-run.ts)。
//
// 横方向はすべて「時間」で持つ。t = 1 が 7 hops ぶん。
// 画面の幅が違っても「何秒後に何が来るか」は同じになるので、スマホでも PC でも同じ難しさになる。
// 後半にかけて速くなるのは、t の進み方(speedAt)を上げて表現する。コースの形そのものは変わらないので、
// 「跳べない配置」が速さのせいで生まれることはない。
//
// 縦方向は、アイコンの直径を BALL(= 40)としたときの長さ。
//
// 遊び方は 2 つ。
//   goal    … 404 hops でゴール。コースの区切りと反転の場所は毎回同じ。ジャンプの高さは一定
//   endless … 一度クリアした人向け。ゴールがなく、先へ行くほど手数が増える。
//             ジャンプは押した長さで高さが変わる(長押し = goal と同じ高さ、短押し = 低くて早く着地)

export const GOAL_HOPS = 404;
export const HOPS_PER_UNIT = 7;
export const GOAL = GOAL_HOPS / HOPS_PER_UNIT;

/** goal で上空の障害物が出始める hops(中間) */
const PHASE2_HOPS = 130;

/** endless で、それぞれが出始める hops。新しいものは 1 つずつ増える */
const ENDLESS_AIR_HOPS = 60; // 上空の障害物
const ENDLESS_FLIP_HOPS = 150; // 反転(上下か左右の片方)
const ENDLESS_DOUBLE_HOPS = 200; // 2 連
const ENDLESS_LONG_HOPS = 270; // くっついた長い塊(長押しで越える)
const ENDLESS_CEILING_HOPS = 340; // 天井つき(短押しでくぐる)
const ENDLESS_BOTH_FLIP_HOPS = 420; // 上下と左右の同時反転
const ENDLESS_TRIPLE_HOPS = 500; // 3 連
/** endless の反転の間隔(hops) */
const ENDLESS_FLIP_EVERY = { min: 40, max: 70 };
/** endless の速さと詰まり具合が上限に届く hops */
const ENDLESS_RAMP_HOPS = 1200;
/** 連続の中の、障害物の前の端どうしの間隔。短押しなら刻んで抜けられる。長押しは早めに跳ばないと間に合わない */
const CHAIN_STEP = { min: 0.42, max: 0.48 };

export const BALL = 40;
/** 長押し(または goal)のジャンプの滞空時間と高さ */
export const JUMP_TIME = 0.6;
export const JUMP_HEIGHT = 100;
const GRAVITY = (8 * JUMP_HEIGHT) / (JUMP_TIME * JUMP_TIME);
const TAKEOFF = (4 * JUMP_HEIGHT) / JUMP_TIME;
/** 離したあとは重力をこの倍率にして、早く落とす */
const CUT_GRAVITY = 2.2;
/** どんなに短い入力でも、この時間は押していた扱い(一瞬の入力でも越えられる高さを保つ) */
const MIN_HOLD = 0.09;
/** 着地の直前に押した分は、着地してすぐ跳ぶ(押し損ねたと感じさせないため) */
export const JUMP_BUFFER = 0.15;

export const NOISE_HEIGHT = 28;
export const AIR_LOW = 56;
export const AIR_HIGH = 100;
/** 天井の板。短押しのジャンプは下をくぐれて、長押しだと頭がぶつかる高さ */
export const CEILING_LOW = 128;
export const CEILING_HIGH = 146;
/** 天井の板が、下の障害物より前後にはみ出す長さ */
const CEILING_MARGIN = 0.1;
/** 当たり判定の左右の幅(片側)。見た目の半径より小さくして、かすった程度は許す */
const HIT = 0.03;

/** 反転にかける時間と、その何 t 前から予告するか */
export const FLIP_TIME = 0.45;
export const FLIP_WARN = 1.5;
/** 反転の前後で、障害物を置かない時間 */
const FLIP_CLEAR_BEFORE = 0.5;
const FLIP_CLEAR_AFTER = 1.2;

export type Mode = "goal" | "endless";
export type Kind = "gap" | "noise" | "air" | "ceiling";

export interface Obstacle {
  kind: Kind;
  /** 前の端がプレイヤーの位置に来る時刻 */
  t: number;
  /** 通り過ぎるのにかかる時間(= 横幅) */
  dur: number;
}

export interface Flip {
  t: number;
  /** 反転後の向き。x = -1 は左右反転(障害物が左から来る)、y = -1 は上下反転 */
  x: 1 | -1;
  y: 1 | -1;
}

/** goal の後半の反転。順番と場所は毎回同じ(覚えれば対応できる)。最後はゴールに向けて元の向きに戻る */
export const FLIPS: Flip[] = (
  [
    { hops: 265, x: 1, y: -1 }, // 上下
    { hops: 300, x: -1, y: -1 }, // 上下 + 左右
    { hops: 335, x: -1, y: 1 }, // 左右
    { hops: 370, x: 1, y: 1 }, // 元どおり
  ] as const
).map(({ hops, x, y }) => ({ t: hops / HOPS_PER_UNIT, x, y }));

const endlessRamp = (t: number) => Math.min(1, (t * HOPS_PER_UNIT) / ENDLESS_RAMP_HOPS);

export const speedAt = (t: number, mode: Mode): number =>
  mode === "goal" ? 1 + 0.3 * Math.min(1, t / GOAL) : 1.1 + 0.6 * endlessRamp(t);

export interface Course {
  mode: Mode;
  obstacles: Obstacle[];
  flips: Flip[];
  /** 時刻 until までのコースを用意する。goal は最初に全部作るので、何もしない */
  extend(until: number): void;
}

/** ひとまとまりの障害物の並び。t は先頭からの時間 */
type PatternName = "single" | "air" | "double" | "triple" | "long" | "ceiling";

export function createCourse(mode: Mode, random: () => number = Math.random): Course {
  const endless = mode === "endless";
  const between = (min: number, max: number) => min + (max - min) * random();
  const obstacles: Obstacle[] = [];
  const flips: Flip[] = endless ? [] : [...FLIPS];
  const airFrom = (endless ? ENDLESS_AIR_HOPS : PHASE2_HOPS) / HOPS_PER_UNIT;

  let t = 2.5; // 走り出してすぐは何も置かない
  /** 一度でも出したまとまり。新しいものは出始めに必ず 1 回見せる */
  const seen = new Set<PatternName>();
  let flipHops = ENDLESS_FLIP_HOPS;
  let x: 1 | -1 = 1;
  let y: 1 | -1 = 1;
  let bothShown = false;

  /** endless の反転は、先の分をその都度足す。序盤は片方の軸だけ、途中からは同時もある */
  const addFlips = (until: number) => {
    while (flipHops / HOPS_PER_UNIT < until) {
      const canBoth = flipHops >= ENDLESS_BOTH_FLIP_HOPS;
      const both = canBoth && (!bothShown || random() < 0.35 + 0.25 * endlessRamp(flipHops / HOPS_PER_UNIT));
      if (both) {
        bothShown = true;
        x = x === 1 ? -1 : 1;
        y = y === 1 ? -1 : 1;
      } else if (random() < 0.5) x = x === 1 ? -1 : 1;
      else y = y === 1 ? -1 : 1;
      flips.push({ t: flipHops / HOPS_PER_UNIT, x, y });
      flipHops += between(ENDLESS_FLIP_EVERY.min, ENDLESS_FLIP_EVERY.max);
    }
  };

  const choose = (): PatternName => {
    const hops = t * HOPS_PER_UNIT;
    const air = t >= airFrom;
    if (air && !seen.has("air")) return "air";

    if (endless && hops >= ENDLESS_DOUBLE_HOPS) {
      const unlocked: PatternName[] = ["double"];
      if (hops >= ENDLESS_LONG_HOPS) unlocked.push("long");
      if (hops >= ENDLESS_CEILING_HOPS) unlocked.push("ceiling");
      if (hops >= ENDLESS_TRIPLE_HOPS) unlocked.push("triple");
      const fresh = unlocked.find((name) => !seen.has(name));
      if (fresh) return fresh;
      const rate = 0.25 + 0.3 * Math.min(1, (hops - ENDLESS_DOUBLE_HOPS) / 800);
      if (random() < rate) return unlocked[Math.floor(random() * unlocked.length)];
    }
    return air && random() < 0.32 ? "air" : "single";
  };

  const ground = (): Kind => (random() < 0.5 ? "gap" : "noise");

  const build = (name: PatternName): Obstacle[] => {
    if (name === "air") return [{ kind: "air", t: 0, dur: between(0.09, 0.16) }];
    if (name === "long") return [{ kind: "noise", t: 0, dur: between(0.28, 0.32) }];
    if (name === "ceiling") {
      const dur = between(0.08, 0.11);
      return [
        { kind: "ceiling", t: 0, dur: dur + CEILING_MARGIN * 2 },
        { kind: "noise", t: CEILING_MARGIN, dur },
      ];
    }
    if (name === "single") {
      const kind = ground();
      return [{ kind, t: 0, dur: kind === "gap" ? between(0.14, 0.24) : between(0.09, 0.16) }];
    }
    // 連続は、1 つずつを小さめにする
    let at = 0;
    return Array.from({ length: name === "double" ? 2 : 3 }, () => {
      const kind = ground();
      const obstacle = { kind, t: at, dur: kind === "gap" ? between(0.1, 0.13) : between(0.07, 0.09) };
      at += between(CHAIN_STEP.min, CHAIN_STEP.max);
      return obstacle;
    });
  };

  /** 次のまとまりまでの間隔。どの場合も「着地して、もう一度跳べる」より長くする */
  const spacing = () => {
    if (t < airFrom) return between(1.2, 1.9);
    if (!endless) return between(1.05, 1.7);
    const k = endlessRamp(t);
    return between(1.05 - 0.05 * k, 1.7 - 0.35 * k);
  };

  const extend = (until: number) => {
    // 反転の場所は、その周りの障害物を置くより先に決まっている必要がある
    if (endless) addFlips(until + 4);

    while (t < until) {
      const name = choose();
      const pattern = build(name);
      const length = Math.max(...pattern.map((o) => o.t + o.dur));

      // 反転の前後に重なる場合は、反転が終わって落ち着くまで後ろへずらす
      const flip = flips.find((f) => t < f.t + FLIP_CLEAR_AFTER && t + length > f.t - FLIP_CLEAR_BEFORE);
      if (flip) {
        t = flip.t + FLIP_CLEAR_AFTER;
        continue;
      }
      if (!endless && t + length > GOAL - 2) {
        t = Infinity; // ゴール手前は静かにする。ここで打ち切り
        break;
      }

      for (const o of pattern) obstacles.push({ ...o, t: t + o.t });
      seen.add(name);
      const gap = spacing();
      t += length + gap;
    }
  };

  extend(endless ? 12 : Infinity);
  return { mode, obstacles, flips, extend };
}

export interface Runner {
  t: number;
  /** 跳び始めた時刻。接地中は null */
  jumpAt: number | null;
  y: number;
  vy: number;
  /** ボタンや指を押し続けているか */
  held: boolean;
  /** 今のジャンプを途中で離したか(押し直しても元には戻らない) */
  cut: boolean;
  queued: boolean;
  /** 押した長さで高さが変わるか(endless) */
  variable: boolean;
  /** 自動操縦が、今のジャンプを何 t で離すか */
  autoHold: number;
}

export const createRunner = (t = 0, variable = false): Runner => ({
  t,
  jumpAt: null,
  y: 0,
  vy: 0,
  held: false,
  cut: false,
  queued: false,
  variable,
  autoHold: 0,
});

const gravityOf = (r: Runner) =>
  r.variable && r.cut && r.jumpAt !== null && r.t - r.jumpAt >= MIN_HOLD ? GRAVITY * CUT_GRAVITY : GRAVITY;

function takeOff(r: Runner): void {
  r.jumpAt = r.t;
  r.vy = TAKEOFF;
  r.y = 0;
  r.cut = !r.held; // 着地前に押して離していた分は、短いジャンプになる
}

export function press(r: Runner): void {
  r.held = true;
  if (r.jumpAt === null) {
    takeOff(r);
    return;
  }
  // 着地までの時間が短ければ、次のジャンプとして覚えておく
  const g = gravityOf(r);
  if ((r.vy + Math.sqrt(r.vy * r.vy + 2 * g * r.y)) / g <= JUMP_BUFFER) r.queued = true;
}

export function release(r: Runner): void {
  r.held = false;
  if (r.jumpAt !== null) r.cut = true;
}

/** 接地面からの高さ */
export const heightOf = (r: Runner): number => r.y;

export function advance(r: Runner, dt: number): void {
  const g = gravityOf(r);
  r.t += dt;
  if (r.jumpAt === null) return;
  r.y += r.vy * dt - 0.5 * g * dt * dt;
  r.vy -= g * dt;
  if (r.y > 0 || r.vy >= 0) return;
  r.y = 0;
  r.jumpAt = null;
  if (r.queued) {
    r.queued = false;
    takeOff(r);
  }
}

export function hits(o: Obstacle, r: Runner): boolean {
  const y = r.y;
  switch (o.kind) {
    case "gap":
      // 中心が切れ目の内側まで入った状態で接地していたら落ちる
      return r.t >= o.t + HIT && r.t <= o.t + o.dur - HIT && y <= 4;
    case "noise":
      return r.t + HIT >= o.t && r.t - HIT <= o.t + o.dur && y < NOISE_HEIGHT * 0.75;
    case "air":
      return r.t + HIT >= o.t && r.t - HIT <= o.t + o.dur && y + BALL > AIR_LOW + 4 && y < AIR_HIGH - 4;
    case "ceiling":
      return r.t + HIT >= o.t && r.t - HIT <= o.t + o.dur && y + BALL > CEILING_LOW + 4 && y < CEILING_HIGH;
  }
}

const onGround = (o: Obstacle) => o.kind === "gap" || o.kind === "noise";

/** 自動操縦(テストと、dev の ?auto 用)。毎ステップ呼ぶと、必要なときに押して離す */
export function autoPlay(obstacles: Obstacle[], r: Runner): void {
  if (r.jumpAt !== null) {
    if (r.held && r.t - r.jumpAt >= r.autoHold) release(r);
    return;
  }
  const ground = obstacles.filter(onGround);
  const i = ground.findIndex((o) => o.t + o.dur > r.t);
  if (i < 0) return;
  const next = ground[i];
  const close = (a?: Obstacle, b?: Obstacle) => a !== undefined && b !== undefined && b.t - (a.t + a.dur) < 0.7;
  const roofed = obstacles.some((o) => o.kind === "ceiling" && o.t < next.t && o.t + o.dur > next.t);
  const long = next.dur > 0.25;
  // 天井の下と、前後が詰まっている場所は短く押す。それ以外は長押し
  const short = r.variable && !long && (roofed || close(next, ground[i + 1]) || close(ground[i - 1], next));
  if (r.t < next.t + next.dur / 2 - (short ? 0.18 : JUMP_TIME / 2)) return;
  r.autoHold = short ? MIN_HOLD : JUMP_TIME;
  press(r);
}
