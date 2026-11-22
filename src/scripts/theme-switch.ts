// テーマ切り替えと、その演出(フェード × ピクセルディゾルブ)。
//
// しくみ
//   1. 切り替える直前に、画面全体を「旧テーマの背景色」で塗ったキャンバスを最前面に置く
//   2. 同じフレーム内でテーマを切り替える(キャンバスの下で新テーマに変わる)
//   3. キャンバスを粗いピクセル単位で、ばらばらの順番に、少しずつ透明にしていく
//      → 新テーマが小さな四角の穴から染み出すように現れる
//
// View Transitions API は旧画面を画像として固めて重ねるので、その間メビウスなどの
// アニメーションが止まって見える。こちらは上に色を重ねるだけなので、裏は動き続ける。
//
// キャンバスはピクセル数を「画面 ÷ CELL」に落として描き、CSS で引き伸ばす
// (image-rendering: pixelated)。1 マス = 1 画素なので、毎フレームの計算はとても軽い。

export type Theme = "dark" | "light";

const DURATION = 420; // ms。操作の邪魔にならない 300〜500ms の範囲
const CELL = 14; // 1 マスの大きさ(CSS px)
// 各マスが消え始めてから消え切るまでの長さ(全体に対する割合)。
// 0 だとパッと消える純粋なディゾルブ、1 だと全マス一斉のフェードになる。その中間
const SOFTNESS = 0.35;

let current: { cancel(): void } | null = null;

export function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("theme", theme);
}

/**
 * テーマを切り替える。origin を渡すと、その位置に近いマスほど早く消える
 * (押したスイッチのあたりから新しいテーマが広がっていく)。
 */
export function switchTheme(next: Theme, origin?: { x: number; y: number }) {
  current?.cancel();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    applyTheme(next);
    return;
  }

  // 旧テーマの背景色は、切り替える前に読んでおく
  const oldBg = getComputedStyle(document.documentElement).backgroundColor;

  const w = Math.ceil(window.innerWidth / CELL);
  const h = Math.ceil(window.innerHeight / CELL);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: `${w * CELL}px`,
    height: `${h * CELL}px`,
    zIndex: "2147483647",
    pointerEvents: "none",
    imageRendering: "pixelated",
  });
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    applyTheme(next);
    return;
  }

  // 旧背景色を RGB に分解する
  ctx.fillStyle = oldBg;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

  // 各マスが消え始めるタイミング(0〜1)。乱数を主に、起点からの距離を少し混ぜる
  const ox = (origin?.x ?? window.innerWidth) / CELL;
  const oy = (origin?.y ?? 0) / CELL;
  const maxDist = Math.hypot(Math.max(ox, w - ox), Math.max(oy, h - oy)) || 1;
  const start = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.hypot(x - ox, y - oy) / maxDist;
      start[y * w + x] = (0.6 * Math.random() + 0.4 * dist) * (1 - SOFTNESS);
    }
  }

  const image = ctx.createImageData(w, h);
  const px = image.data;
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  // 旧テーマの色で覆ってから、同じフレームのうちに切り替える(ちらつかない)
  document.body.appendChild(canvas);
  applyTheme(next);

  let raf = 0;
  const t0 = performance.now();
  const frame = (now: number) => {
    const t = Math.min(1, (now - t0) / DURATION);
    for (let i = 0; i < w * h; i++) {
      const local = Math.min(1, Math.max(0, (t - start[i]) / SOFTNESS));
      // 消え際をなめらかにする(smoothstep)
      const fade = local * local * (3 - 2 * local);
      px[i * 4 + 3] = 255 * (1 - fade);
    }
    ctx.putImageData(image, 0, 0);
    if (t < 1) {
      raf = requestAnimationFrame(frame);
    } else {
      finish();
    }
  };
  const finish = () => {
    cancelAnimationFrame(raf);
    clearTimeout(fallback);
    canvas.remove();
    current = null;
  };
  raf = requestAnimationFrame(frame);
  // タブが裏に回るなどで requestAnimationFrame が止まっても、覆いが残らないようにする保険
  const fallback = window.setTimeout(finish, DURATION + 250);
  current = { cancel: finish };
}
