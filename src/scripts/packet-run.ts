// 404 のミニゲームの描画と入力。ルールは packet-run-model.ts。
//
// 絵は「回線」の 1 本の線だけ。自分(丸アイコン)が転がり、切れ目とノイズを跳び越え、
// 404 hops で相手に繋がると 200 OK になる。
// ノイズの見た目は /about の CRT モニター(crt.ts)のグリッチに合わせている: 横帯のずれ・色ずれ・ざらつき。
// ただし普段は障害物と切れ目の周りだけ。画面全体が崩れるのは、失敗した瞬間と繋がった瞬間だけ。
//
// 一度クリアしたブラウザでは、エンドレスを選べるようになる(404.astro のトグル)。
//
// 確認用(dev サーバーだけで有効): ?from=265 で途中の hops から開始、?auto で自動操縦、
// ?mode=endless でクリアせずにエンドレスを試す。

import {
  advance,
  AIR_HIGH,
  AIR_LOW,
  autoPlay,
  BALL,
  CEILING_HIGH,
  CEILING_LOW,
  createCourse,
  createRunner,
  FLIP_TIME,
  FLIP_WARN,
  GOAL,
  GOAL_HOPS,
  heightOf,
  hits,
  HOPS_PER_UNIT,
  NOISE_HEIGHT,
  press,
  release,
  speedAt,
  type Flip,
  type Mode,
} from "./packet-run-model";

type State = "idle" | "running" | "paused" | "lost" | "connecting" | "done";

/** 最高記録の保存先。goal の記録が 404 なら「クリア済み」 */
const BEST_KEYS: Record<Mode, string> = { goal: "packet-run-best", endless: "packet-run-endless-best" };
/** ノイズの色ずれに使う 2 色 */
const GLITCH_RED = "#ff5d73";
const GLITCH_CYAN = "#4fe3ff";
const JUMP_KEYS = ["Space", "ArrowUp", "KeyW"];
/** 指の端末では、開始と再挑戦は盤面を押したときだけ(トグルやボタンの近くに触れて始まらないように) */
const TAP = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches ? "盤面をタップ" : "タップ";
/** 失敗・クリアの直後は入力を受けない(連打で結果が一瞬で流れないように) */
const LOCK_MS = { lost: 600, done: 900 };

/** 繋がる演出の区切り(秒) */
const LINK_END = 0.7; // 線が 1 本になる
const ROLL_END = 1.5; // 相手まで転がる
const SHAKE_PASS = 0.3; // ハンドシェイク 1 回ぶん
const CONNECT_END = ROLL_END + SHAKE_PASS * 3;
const SHAKE_LABELS = ["SYN →", "← SYN-ACK", "ACK →"];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (v: number) => v * v * (3 - 2 * v);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** 位置と時刻から決まる 0〜1 の疑似乱数(状態を持たずにざらつきを描くため) */
function hash(a: number, b: number, c: number): number {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

/** 向き。反転の瞬間をはさんで -1 〜 1 の間をなめらかに移る(0 で一度ぺたんと潰れる) */
function orientationAt(flips: Flip[], t: number, instant: boolean) {
  let x = 1;
  let y = 1;
  for (const f of flips) {
    const p = instant ? (t >= f.t ? 1 : 0) : clamp01((t - (f.t - FLIP_TIME / 2)) / FLIP_TIME);
    if (p === 0) break;
    x = mix(x, f.x, ease(p));
    y = mix(y, f.y, ease(p));
  }
  return { x, y };
}

/** 次の反転が近ければ、その予告文 */
function flipWarning(flips: Flip[], t: number): string {
  const i = flips.findIndex((f) => t < f.t);
  if (i < 0 || flips[i].t - t > FLIP_WARN) return "";
  const before = i === 0 ? { x: 1, y: 1 } : flips[i - 1];
  const vertical = flips[i].y !== before.y;
  if (vertical && flips[i].x !== before.x) return "↕↔ 上下左右反転";
  return vertical ? "↕ 上下反転" : "↔ 左右反転";
}

const loadBest = (mode: Mode) => {
  try {
    return Number(localStorage.getItem(BEST_KEYS[mode])) || 0;
  } catch {
    return 0;
  }
};
const saveBest = (mode: Mode, hops: number) => {
  try {
    localStorage.setItem(BEST_KEYS[mode], String(hops));
  } catch {
    /* 保存できない環境では記録しないだけ */
  }
};

export function initPacketRun(): void {
  const root = document.querySelector<HTMLElement>("[data-run]");
  if (!root) return;
  const $ = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-run-${name}]`)!;
  const canvas = $<HTMLCanvasElement>("canvas");
  const noise = $<HTMLCanvasElement>("noise");
  const eyebrow = $("eyebrow");
  const code = $("code");
  const status = $("status");
  const bestEl = $("best");
  const warn = $("warn");
  const hint = $("hint");
  const announce = $("announce");
  const modes = $("modes");
  const modeButtons = Array.from(modes.querySelectorAll<HTMLButtonElement>("[data-mode]"));
  const tweet = $<HTMLAnchorElement>("tweet");
  const copy = $<HTMLButtonElement>("copy");
  const copyLabel = $("copy-label");
  const shareUrl = root.dataset.shareUrl ?? "";
  const ctx = canvas.getContext("2d");
  const noiseCtx = noise.getContext("2d");
  if (!ctx || !noiseCtx) return;

  const icon = new Image();
  icon.src = "/icon.png";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const params = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
  const auto = params?.has("auto") ?? false;
  const preview = params?.get("mode") === "endless";
  const fromHops = Math.max(0, Number(params?.get("from")) || 0);
  const from = (preview ? fromHops : Math.min(GOAL_HOPS - 1, fromHops)) / HOPS_PER_UNIT;
  const practice = auto || preview || from > 0; // 確認用の走りは記録に残さない

  const abort = new AbortController();
  const { signal } = abort;

  // ---- 色(テーマに追従) ----
  const readColors = () => {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    return {
      text: v("--text"),
      muted: v("--text-muted"),
      line: v("--line"),
      accent: v("--accent"),
      glow: v("--accent-glow"),
      bg: v("--bg-deep"),
    };
  };
  let color = readColors();
  const themeWatch = new MutationObserver(() => (color = readColors()));
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  // ---- 大きさ ----
  let W = 0;
  let H = 0;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 全画面ノイズは粗いほうがそれらしいので、4px を 1 ドットにする
    noise.width = Math.ceil(window.innerWidth / 4);
    noise.height = Math.ceil(window.innerHeight / 4);
  };
  const resizeWatch = new ResizeObserver(resize);
  resizeWatch.observe(canvas);
  resize();

  /** 画面幅で変わる寸法。k は縦方向の倍率、speed は t = 1 あたりの px */
  const layout = () => {
    const narrow = W < 600;
    const size = narrow ? 34 : 42;
    return {
      narrow,
      size,
      k: size / BALL,
      // 線は下から 56px。上下反転すると上から 56px になり、跳ぶ余地はそのまま残る
      ground: H - 56,
      px: narrow ? 52 : 120,
      dest: W - (narrow ? 26 : 48),
      speed: Math.min(400, Math.max(230, W * 0.4)),
    };
  };

  // ---- 状態 ----
  let state: State = "idle";
  let mode: Mode = preview ? "endless" : "goal";
  let course = createCourse(mode);
  let runner = createRunner();
  let since = performance.now(); // 今の状態に入った時刻
  let burstUntil = 0;
  let connectT = 0;
  const best: Record<Mode, number> = { goal: loadBest("goal"), endless: loadBest("endless") };
  /** エンドレスを選べるか(一度クリアしたら true) */
  let unlocked = preview || best.goal >= GOAL_HOPS;
  const shown = new Map<HTMLElement, string>();

  /** 変わったときだけ DOM を書き換える */
  const setText = (el: HTMLElement, value: string) => {
    if (shown.get(el) === value) return;
    shown.set(el, value);
    el.textContent = value;
  };

  const hopsNow = () => {
    const hops = Math.floor(runner.t * HOPS_PER_UNIT);
    return mode === "goal" ? Math.min(GOAL_HOPS, hops) : hops;
  };
  /** 「123 / 404 hops」。エンドレスは分母がない */
  const progress = (hops: number) => (mode === "goal" ? `${hops} / ${GOAL_HOPS} hops` : `${hops} hops`);
  const showBest = () => {
    const value = best[mode];
    setText(bestEl, mode === "goal" && value >= GOAL_HOPS ? "cleared ✓" : value > 0 ? `best ${value}` : "");
  };

  /** トグルの表示を今の状態に合わせる。白い台は、選ばれたボタンの位置と幅へ移す */
  const showModes = () => {
    modes.classList.toggle("is-available", unlocked);
    for (const button of modeButtons) {
      const active = button.dataset.mode === mode;
      button.setAttribute("aria-pressed", String(active));
      if (!active) continue;
      modes.style.setProperty("--x", `${button.offsetLeft}px`);
      modes.style.setProperty("--w", `${button.offsetWidth}px`);
    }
  };

  const enter = (next: State) => {
    state = next;
    since = performance.now();
    root.dataset.state = next;
  };

  const record = (hops: number) => {
    if (practice || hops <= best[mode]) return;
    best[mode] = hops;
    saveBest(mode, hops);
    showBest();
  };

  /** 待機画面に戻す */
  const reset = () => {
    enter("idle");
    setText(code, "404");
    setText(eyebrow, "ページが見つかりません");
    setText(status, "no route to host");
    setText(warn, "");
    setText(hint, mode === "goal" ? `Space / ${TAP}で再接続` : `Space / ${TAP}で開始 · 長く押すほど高く跳ぶ`);
  };

  /** 画面全体のノイズと、見出しの色ずれ。点滅が負担になる人向けの設定では出さない */
  const burst = () => {
    if (reduced) return;
    burstUntil = performance.now() + 450;
    code.classList.remove("is-glitch");
    void code.offsetWidth; // アニメーションを最初からやり直す
    code.classList.add("is-glitch");
  };

  const jumpHint = () => (mode === "goal" ? "Space / ↑ / タップでジャンプ" : "長押しで高く、短く押すと低くジャンプ");

  const start = () => {
    course = createCourse(mode);
    if (from > 0) {
      // 途中から始めるときは、そこまでの障害物を取り除く
      course.extend(from + 12);
      course.obstacles.splice(0, course.obstacles.findIndex((o) => o.t > from + 1.5));
    }
    runner = createRunner(from, mode === "endless"); // 押す長さで高さが変わるのはエンドレスだけ
    connectT = 0;
    enter("running");
    setText(code, "404");
    setText(eyebrow, "再接続を試みています");
    setText(hint, jumpHint());
    setText(announce, "ゲームを開始しました");
  };

  // ---- 結果の共有 ----
  let shareText = "";
  const setShare = (text: string) => {
    shareText = text;
    tweet.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    setText(copyLabel, "結果をコピー");
  };

  const lose = () => {
    const hops = hopsNow();
    record(hops);
    enter("lost");
    burst();
    setText(eyebrow, "接続が切れました");
    setText(status, `connection lost · ${progress(hops)}`);
    setText(warn, "");
    setText(hint, `Space / ${TAP}でもう一度`);
    setText(announce, `接続が切れました。${hops} hops`);
    setShare(
      mode === "goal"
        ? `404ページのミニゲームで ${progress(hops)} まで進んだ`
        : `404ページのミニゲーム(Endless)で ${hops} hops 到達した`,
    );
  };

  const finish = () => {
    record(GOAL_HOPS);
    unlocked = true;
    showModes();
    enter("done");
    burst();
    setText(code, "200");
    setText(eyebrow, "つながりました");
    setText(status, `200 OK · ${GOAL_HOPS} hops`);
    setText(hint, `Space / ${TAP}でもう一度`);
    setText(announce, "つながりました。200 OK");
    setShare(`404ページのミニゲームをクリアした！\n${GOAL_HOPS} hops → 200 OK`);
  };

  const connect = () => {
    runner = createRunner(GOAL);
    connectT = 0;
    enter("connecting");
    setText(warn, "");
    setText(eyebrow, "応答があります");
    setText(hint, "");
    if (reduced) finish();
  };

  const action = () => {
    const waited = performance.now() - since;
    if (state === "idle") start();
    else if (state === "running") press(runner);
    else if (state === "paused") {
      enter("running");
      setText(hint, jumpHint());
    } else if (state === "lost" && waited > LOCK_MS.lost) start();
    else if (state === "done" && waited > LOCK_MS.done) start();
  };

  // 押したあとはフォーカスを外して、次の Space がゲームに届くようにする
  tweet.addEventListener("click", (e) => e.detail > 0 && tweet.blur(), { signal });
  copy.addEventListener(
    "click",
    async (e) => {
      if (e.detail > 0) copy.blur();
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        setText(copyLabel, "コピーしました");
      } catch {
        setText(copyLabel, "コピーできません");
      }
    },
    { signal },
  );

  // ---- 遊び方の切り替え ----
  for (const button of modeButtons) {
    button.addEventListener(
      "click",
      (e) => {
        if (state === "running" || state === "paused" || state === "connecting") return;
        const next = button.dataset.mode as Mode;
        if (next !== mode) {
          mode = next;
          reset();
          showBest();
          showModes();
        }
        // マウスやタップで選んだあと、次の Space がボタンではなくゲームに届くようにする
        if (e.detail > 0) button.blur();
      },
      { signal },
    );
  }
  // フォントの読み込みや画面幅の変化でボタンの幅が変わったら、台も合わせ直す
  const modesWatch = new ResizeObserver(showModes);
  modesWatch.observe(modes);

  // ---- 入力 ----
  // リンクやボタン(ヘッダーのテーマ切り替えなど)の操作は横取りしない
  const isControl = (target: EventTarget | null) =>
    target instanceof Element && target.closest("a, button, input, textarea, select, [role='menu']") !== null;

  window.addEventListener(
    "keydown",
    (e) => {
      if (!JUMP_KEYS.includes(e.code)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || isControl(e.target)) return;
      e.preventDefault(); // Space でページがスクロールしないように
      if (!e.repeat) action();
    },
    { signal },
  );
  root.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0 || isControl(e.target)) return;
      // 走行中は画面のどこでもジャンプ。それ以外のとき、指では盤面だけが反応する
      const onStage = e.target instanceof Element && e.target.closest(".stage") !== null;
      if (e.pointerType !== "mouse" && state !== "running" && !onStage) return;
      e.preventDefault();
      action();
    },
    { signal },
  );
  // 離した瞬間も必要(エンドレスは押した長さで高さが変わる)。画面の外で離しても拾えるよう window で受ける
  const letGo = () => {
    if (state === "running" && !auto) release(runner);
  };
  window.addEventListener("keyup", (e) => JUMP_KEYS.includes(e.code) && letGo(), { signal });
  for (const type of ["pointerup", "pointercancel", "blur"]) window.addEventListener(type, letGo, { signal });
  // 指の長押しでメニューが出ないように
  root.addEventListener("contextmenu", (e) => state === "running" && e.preventDefault(), { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden || state !== "running") return;
      enter("paused");
      setText(hint, `一時停止中 — Space / ${TAP}で再開`);
    },
    { signal },
  );

  // ---- 描画 ----
  /** CRT のざらつき。矩形の中を小さな粒で埋める */
  const staticBlock = (x: number, y: number, w: number, h: number, tick: number, density = 0.7) => {
    const cell = 3;
    for (let i = 0; i * cell < w; i++) {
      for (let j = 0; j * cell < h; j++) {
        const v = hash(i, j, tick);
        if (v > density) continue;
        const tint = hash(j, i, tick + 5);
        ctx.fillStyle = tint < 0.07 ? GLITCH_RED : tint < 0.14 ? GLITCH_CYAN : color.text;
        ctx.globalAlpha = 0.2 + v * 0.8;
        ctx.fillRect(x + i * cell, y + j * cell, cell, cell);
      }
    }
    ctx.globalAlpha = 1;
  };

  /** 色ずれした 2 本の枠 */
  const chroma = (x: number, y: number, w: number, h: number) => {
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = GLITCH_RED;
    ctx.strokeRect(x - 2, y, w, h);
    ctx.strokeStyle = GLITCH_CYAN;
    ctx.strokeRect(x + 2, y, w, h);
    ctx.globalAlpha = 1;
  };

  const segment = (x0: number, x1: number, y: number, stroke: string) => {
    if (x1 <= x0) return;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  };

  const node = (x: number, y: number, stroke: string, filled: boolean) => {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = filled ? stroke : color.bg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  };

  const glowDot = (x: number, y: number) => {
    ctx.save();
    ctx.shadowColor = color.glow;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color.glow;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const drawIcon = (x: number, y: number, size: number, angle: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (icon.complete && icon.naturalWidth) ctx.drawImage(icon, -size / 2, -size / 2, size, size);
    else glowDot(0, 0);
    ctx.restore();
  };

  // 打ち間違いに気づけるよう、踏んだ URL を相手の名前として出す
  let path = location.pathname;
  try {
    path = decodeURI(path);
  } catch {
    /* 壊れたエンコードはそのまま出す */
  }

  const label = (x: number, y: number) => {
    const max = W < 600 ? 22 : 36;
    ctx.font = "12px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color.muted;
    ctx.fillText(path.length > max ? `${path.slice(0, max - 1)}…` : path, Math.min(W - 2, x + 8), y);
  };

  const draw = (now: number) => {
    const L = layout();
    const tick = reduced ? 0 : Math.floor(now / 70); // ざらつきは 1 秒に 14 回だけ描き替える
    ctx.clearRect(0, 0, W, H);
    ctx.save();

    if (state === "idle") {
      // 切れた回線。切れ目の周りだけがざらつく
      const a = mix(L.px, L.dest, 0.46);
      const b = mix(L.px, L.dest, 0.58);
      segment(L.px, a, L.ground, color.accent);
      segment(b, L.dest - 6, L.ground, color.line);
      staticBlock(a + 4, L.ground - 9, b - a - 8, 18, tick, 0.16);
      node(L.dest, L.ground, color.line, false);
      label(L.dest, L.ground - 20);
      drawIcon(L.px, L.ground - L.size / 2, L.size, 0);
      // 送ったパケットが切れ目で消える
      const k = reduced ? 0.6 : (now % 2200) / 2200;
      if (k < 0.7) glowDot(mix(L.px + L.size / 2 + 6, a, k / 0.7), L.ground);
      ctx.restore();
      return;
    }

    if (state === "connecting" || state === "done") {
      const c = state === "done" ? CONNECT_END : connectT;
      const linked = clamp01(c / LINK_END);
      const rolled = ease(clamp01((c - LINK_END) / (ROLL_END - LINK_END)));
      segment(L.px, L.dest - 6, L.ground, color.line);
      segment(L.px, mix(L.px, L.dest - 6, ease(linked)), L.ground, color.accent);
      if (linked < 1) staticBlock(mix(L.px, L.dest, linked), L.ground - 9, (L.dest - L.px) * (1 - linked), 18, tick, 0.12);
      node(L.dest, L.ground, color.accent, state === "done");
      label(L.dest, L.ground - L.size - 22);
      const stop = L.dest - L.size / 2 - 10;
      const x = mix(L.px, stop, rolled);
      // 回転数を整数に丸めて、着いたときに顔がまっすぐ前を向くようにする
      const turns = Math.max(1, Math.round((stop - L.px) / (Math.PI * L.size)));
      drawIcon(x, L.ground - L.size / 2, L.size, rolled * turns * Math.PI * 2);
      if (c >= ROLL_END) {
        // ハンドシェイク: 出発点と相手の間を 行く → 返る → 行く
        const done = state === "done";
        const pass = Math.min(2, Math.floor((c - ROLL_END) / SHAKE_PASS));
        const k = ease(clamp01((c - ROLL_END - pass * SHAKE_PASS) / SHAKE_PASS));
        if (!done) glowDot(pass === 1 ? mix(stop - 24, L.px, k) : mix(L.px, stop - 24, k), L.ground);
        else if (!reduced) {
          // 繋がったあとは、ゆっくり往復し続ける
          const w = (now % 2800) / 1400;
          glowDot(mix(L.px, stop - 24, ease(w < 1 ? w : 2 - w)), L.ground);
        }
      }
      ctx.restore();
      return;
    }

    // ここから走行中(running / paused / lost)
    const o = orientationAt(course.flips, runner.t, reduced);
    ctx.translate(W / 2, H / 2);
    ctx.scale(o.x, o.y);
    ctx.translate(-W / 2, -H / 2);

    const xOf = (t: number) => L.px + (t - runner.t) * L.speed;
    const visible = course.obstacles.filter((ob) => xOf(ob.t + ob.dur) > -20 && xOf(ob.t) < W + 20);

    // 回線。通ってきた側はアクセント色(ここまでは繋がった)。切れ目の部分は描かない
    const gaps = visible.filter((ob) => ob.kind === "gap");
    const destX = mode === "goal" ? L.dest + (GOAL - runner.t) * L.speed : Infinity;
    const lineEnd = Math.min(W, destX - 6);
    const paint = (x0: number, x1: number) => {
      segment(x0, Math.min(x1, L.px), L.ground, color.accent);
      segment(Math.max(x0, L.px), x1, L.ground, color.line);
    };
    let cursor = 0;
    for (const g of gaps) {
      paint(cursor, Math.min(lineEnd, xOf(g.t)));
      cursor = Math.max(cursor, xOf(g.t + g.dur));
    }
    paint(cursor, lineEnd);

    // 流れていることが分かるように、線の下に目盛り(1 本 = 1 hop)
    ctx.fillStyle = color.line;
    const unit = 1 / HOPS_PER_UNIT;
    for (let t = Math.ceil((runner.t - L.px / L.speed) / unit) * unit; xOf(t) < lineEnd; t += unit) {
      if (!gaps.some((g) => t > g.t && t < g.t + g.dur)) ctx.fillRect(xOf(t), L.ground + 6, 1, 4);
    }

    for (const ob of visible) {
      const x = xOf(ob.t);
      const w = ob.dur * L.speed;
      if (ob.kind === "gap") {
        // 切れ目の両端だけがほつれる
        staticBlock(x, L.ground - 4, 9, 9, tick, 0.4);
        staticBlock(x + w - 9, L.ground - 4, 9, 9, tick + 1, 0.4);
      } else if (ob.kind === "noise") {
        const h = NOISE_HEIGHT * L.k;
        // 長い塊は、3 つがくっついた形に見せる(長押しで越える合図)
        const parts = ob.dur > 0.25 ? 3 : 1;
        const each = (w - (parts - 1) * 4) / parts;
        for (let i = 0; i < parts; i++) {
          const bx = x + i * (each + 4);
          staticBlock(bx, L.ground - h, each, h, tick + i);
          chroma(bx, L.ground - h, each, h);
        }
      } else if (ob.kind === "ceiling") {
        // 天井の板。上から吊られていると分かるように、短い線を 2 本添える
        const top = L.ground - CEILING_HIGH * L.k;
        const h = (CEILING_HIGH - CEILING_LOW) * L.k;
        staticBlock(x, top, w, h, tick);
        chroma(x, top, w, h);
        ctx.fillStyle = color.line;
        ctx.fillRect(x + w * 0.2, top - 16, 1, 16);
        ctx.fillRect(x + w * 0.8, top - 16, 1, 16);
      } else {
        const top = L.ground - AIR_HIGH * L.k;
        const h = (AIR_HIGH - AIR_LOW) * L.k;
        staticBlock(x, top, w, h, tick);
        chroma(x, top, w, h);
      }
    }

    if (destX < W + 20) {
      node(destX, L.ground, color.accent, false);
      label(destX, L.ground - 20);
    }

    const y = heightOf(runner) * L.k;
    // 落ちた場合は、線の下へ沈んだ姿で止める
    const fell = state === "lost" && course.obstacles.some((ob) => ob.kind === "gap" && hits(ob, runner));
    const sink = fell ? Math.min(34, (now - since) * 0.18) : 0;
    drawIcon(L.px, L.ground - L.size / 2 - y + sink, L.size, (runner.t * L.speed) / (L.size / 2));
    ctx.restore();

    // 失敗した瞬間は、盤面の横帯がずれる(画面の走査が乱れた感じ)
    if (performance.now() < burstUntil) {
      for (let i = 0; i < 6; i++) {
        const sy = Math.floor(hash(i, tick, 1) * H);
        const sh = 4 + hash(i, tick, 2) * 22;
        const dx = (hash(i, tick, 3) - 0.5) * 60;
        const dpr = canvas.width / W;
        ctx.drawImage(canvas, 0, sy * dpr, canvas.width, sh * dpr, dx, sy, W, sh);
      }
    }
  };

  const drawBurst = (now: number) => {
    noiseCtx.clearRect(0, 0, noise.width, noise.height);
    const left = (burstUntil - now) / 450;
    if (left <= 0) return;
    const tick = Math.floor(now / 50);
    // 横帯。白く光らせず、薄い色を重ねるだけにする
    for (let i = 0; i < 14; i++) {
      const tint = hash(i, tick, 11);
      noiseCtx.fillStyle = tint < 0.33 ? GLITCH_RED : tint < 0.66 ? GLITCH_CYAN : color.text;
      noiseCtx.globalAlpha = 0.22 * left;
      noiseCtx.fillRect(0, hash(i, tick, 12) * noise.height, noise.width, 1 + hash(i, tick, 13) * 5);
    }
    noiseCtx.fillStyle = color.text;
    noiseCtx.globalAlpha = 0.35 * left;
    for (let i = 0; i < 700; i++) {
      noiseCtx.fillRect(hash(i, tick, 21) * noise.width, hash(i, tick, 22) * noise.height, 1, 1);
    }
    noiseCtx.globalAlpha = 1;
  };

  // ---- ループ ----
  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;

    if (state === "running") {
      course.extend(runner.t + 12);
      // 当たり判定がすり抜けないよう、細かく刻んで進める
      let rest = dt * speedAt(runner.t, mode);
      while (rest > 0 && state === "running") {
        if (auto) autoPlay(course.obstacles, runner);
        const step = Math.min(rest, 0.008);
        advance(runner, step);
        rest -= step;
        if (course.obstacles.some((ob) => hits(ob, runner))) lose();
        else if (mode === "goal" && runner.t >= GOAL) connect();
      }
      if (state === "running") {
        setText(status, `routing… ${progress(hopsNow())}`);
        setText(warn, flipWarning(course.flips, runner.t));
      }
    } else if (state === "connecting") {
      connectT += dt;
      const pass = Math.floor((connectT - ROLL_END) / SHAKE_PASS);
      setText(status, connectT < ROLL_END ? "connecting…" : (SHAKE_LABELS[pass] ?? "ACK →"));
      if (connectT >= CONNECT_END) finish();
    }

    draw(now);
    drawBurst(now);
    raf = requestAnimationFrame(frame);
  };

  showBest();
  showModes();
  reset();
  raf = requestAnimationFrame(frame);

  document.addEventListener(
    "astro:before-swap",
    () => {
      cancelAnimationFrame(raf);
      abort.abort();
      themeWatch.disconnect();
      resizeWatch.disconnect();
      modesWatch.disconnect();
    },
    { once: true },
  );
}
