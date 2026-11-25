// /about の CRT モニターの画面に映す、ドット絵の顔。
//
// 80 × 60 ピクセルの小さな canvas に、1 ピクセルずつ四角を置いて描く(拡大するときは NearestFilter でにじませない)。
// 描くのは「形」だけで、色は白(明るさ)と黒。画面の色づけ・走査線・グリッチは、画面のシェーダ(crt.ts)がやる。
//
// 表情
//   idle  … ふだんの顔。目はカーソルを追い、ときどきまばたきする
//   hover … 乗せたとき(^ ^)
//   click … 押したとき(> <)
//   dead  … 5 連打したとき(x x)
//   sleep … 放置されたとき(˘ω˘ + zzz)
//   panic … カーネルパニック風の文字画面(顔ではなく、文字を 1 文字ずつ出す)

export const FACE_W = 80;
export const FACE_H = 60;

export type Expression = "idle" | "hover" | "click" | "dead" | "sleep" | "panic";

export interface FaceState {
  expression: Expression;
  /** 目の向き(ピクセル単位の整数。右・下が正) */
  lookX: number;
  lookY: number;
  blink: boolean;
  /** sleep のとき、出す z の数(0〜3) */
  zzz: number;
  /** panic のとき、ここまで出した文字数 */
  panicChars: number;
}

// ---- 3 × 5 の小さなビットマップフォント(パニック画面と zzz 用) ----
const GLYPHS: Record<string, string> = {
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101010",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "111101101101101",
  O: "010101101101010",
  P: "110101110100100",
  Q: "010101101110011",
  R: "110101110101101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "110001010100111",
  "3": "110001010001110",
  "4": "101101111001001",
  "5": "111100110001110",
  "6": "011100111101111",
  "7": "111001010010010",
  "8": "111101111101111",
  "9": "111101111001110",
  ".": "000000000000010",
  ":": "000010000010000",
  "-": "000000111000000",
  _: "000000000000111",
  "!": "010010010000010",
  ">": "100010001010100",
  "[": "110100100100110",
  "]": "011001001001011",
  "/": "001001010100100",
  "?": "110001010000010",
  "#": "101111101111101",
  "=": "000111000111000",
};

/** 3 × 5 の文字を 1 つ描く(scale 倍)。戻り値は次の文字の x */
function glyph(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, scale = 1): number {
  const g = GLYPHS[ch.toUpperCase()];
  if (g) {
    for (let i = 0; i < 15; i++) {
      if (g[i] === "1") ctx.fillRect(x + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale);
    }
  }
  return x + 4 * scale;
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number) {
  let cx = x;
  for (const ch of s) cx = glyph(ctx, ch, cx, y);
}

/** 文字の絵(各行の "X" のところに点を置く)を、左上の座標 (x, y) から描く */
function art(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === "X") ctx.fillRect(x + i, y + j, 1, 1);
  });
}

const mirror = (rows: string[]) => rows.map((r) => [...r].reverse().join(""));

// ---- パーツ ----
const EYE_HAPPY = ["..XXXX..", ".XX..XX.", "XX....XX"];
const EYE_SQUEEZE_R = ["XX....", ".XX...", "..XX..", "...XX.", "..XX..", ".XX...", "XX...."]; // ">"
const EYE_SQUEEZE_L = mirror(EYE_SQUEEZE_R); // "<"
const EYE_DEAD = ["XX...XX", ".XX.XX.", "..XXX..", "...X...", "..XXX..", ".XX.XX.", "XX...XX"];
const EYE_SLEEP = ["X.....X", "XX...XX", ".XXXXX."]; // "˘"

const MOUTH_IDLE = ["X....X....X", "X....X....X", ".X..X.X..X.", "..XX...XX.."]; // "ω"(11 × 4)
const MOUTH_HOVER = ["XXXXXXXXX", ".XXXXXXX.", "..XXXXX..", "...XXX..."];
const MOUTH_CLICK = ["XXXXXXXXXXX", "XXXXXXXXXXX", ".XXXXXXXXX.", "..XXXXXXX..", "...XXXXX..."];
const MOUTH_DEAD = ["XXXXXXXXXXX", ".........XX", ".........XX"];
const MOUTH_SLEEP = ["X.X.X", ".X.X."];

const EYE_L_X = 26;
const EYE_R_X = 54;
const EYE_Y = 24;
const MOUTH_Y = 40;

/** パニック画面の文言。先頭の 1 行は白地に黒文字の見出しにする */
export const PANIC_LINES = ["KERNEL PANIC", "", "TORA.SYS: HALT", "ERR 0XC11C", "TOO MANY CLICKS", "[ OK ] SYNC", "REBOOTING_"];
export const PANIC_TOTAL = PANIC_LINES.reduce((n, l) => n + l.length, 0);

function drawPanic(ctx: CanvasRenderingContext2D, chars: number) {
  let left = chars;
  PANIC_LINES.forEach((line, row) => {
    const shown = line.slice(0, Math.max(0, left));
    left -= line.length;
    if (row === 0) {
      // 見出し: 白い帯に黒い文字
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 3, FACE_W, 7);
      ctx.fillStyle = "#000";
      text(ctx, shown, 4, 4);
    } else {
      ctx.fillStyle = "#fff";
      text(ctx, shown, 4, 8 + row * 7);
    }
  });
  // 打っている最中のカーソル
  if (chars < PANIC_TOTAL) {
    let rowStart = 0;
    for (let row = 0; row < PANIC_LINES.length; row++) {
      const len = PANIC_LINES[row].length;
      if (chars <= rowStart + len) {
        const cx = 4 + (chars - rowStart) * 4;
        const cy = row === 0 ? 4 : 8 + row * 7;
        ctx.fillStyle = row === 0 ? "#000" : "#fff";
        ctx.fillRect(cx, cy, 3, 5);
        break;
      }
      rowStart += len;
    }
  }
}

export function drawFace(ctx: CanvasRenderingContext2D, s: FaceState) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  ctx.fillStyle = "#fff";

  if (s.expression === "panic") {
    drawPanic(ctx, s.panicChars);
    return;
  }

  const lx = s.lookX;
  const ly = s.lookY;
  const mx = 40; // 口の中心

  switch (s.expression) {
    case "idle": {
      for (const ex of [EYE_L_X, EYE_R_X]) {
        const x = ex - 3 + lx;
        const y = EYE_Y - 5 + ly;
        if (s.blink) {
          ctx.fillRect(x, y + 5, 6, 1);
        } else {
          ctx.fillRect(x, y, 6, 10);
          // ハイライト(黒く抜く)
          ctx.fillStyle = "#000";
          ctx.fillRect(x + 1, y + 1, 2, 2);
          ctx.fillStyle = "#fff";
        }
      }
      art(ctx, MOUTH_IDLE, mx - 5 + Math.round(lx / 2), MOUTH_Y - 1);
      break;
    }
    case "hover": {
      art(ctx, EYE_HAPPY, EYE_L_X - 4 + lx, EYE_Y - 1 + ly);
      art(ctx, EYE_HAPPY, EYE_R_X - 4 + lx, EYE_Y - 1 + ly);
      art(ctx, MOUTH_HOVER, mx - 4 + Math.round(lx / 2), MOUTH_Y - 1);
      break;
    }
    case "click": {
      art(ctx, EYE_SQUEEZE_R, EYE_L_X - 3, EYE_Y - 3);
      art(ctx, EYE_SQUEEZE_L, EYE_R_X - 3, EYE_Y - 3);
      art(ctx, MOUTH_CLICK, mx - 5, MOUTH_Y - 2);
      // ほっぺ
      ctx.globalAlpha = 0.5;
      ctx.fillRect(14, 36, 6, 2);
      ctx.fillRect(60, 36, 6, 2);
      ctx.globalAlpha = 1;
      break;
    }
    case "dead": {
      art(ctx, EYE_DEAD, EYE_L_X - 3, EYE_Y - 3);
      art(ctx, EYE_DEAD, EYE_R_X - 3, EYE_Y - 3);
      art(ctx, MOUTH_DEAD, mx - 5, MOUTH_Y + 1);
      break;
    }
    case "sleep": {
      art(ctx, EYE_SLEEP, EYE_L_X - 3, EYE_Y + 2);
      art(ctx, EYE_SLEEP, EYE_R_X - 3, EYE_Y + 2);
      ctx.globalAlpha = 0.7;
      art(ctx, MOUTH_SLEEP, mx - 2, MOUTH_Y + 2);
      ctx.globalAlpha = 1;
      // zzz: 右上へ、だんだん大きく
      if (s.zzz >= 1) glyph(ctx, "Z", 60, 24);
      if (s.zzz >= 2) glyph(ctx, "Z", 63, 12, 2);
      if (s.zzz >= 3) glyph(ctx, "Z", 67, 0, 3);
      break;
    }
  }
}
