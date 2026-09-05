// トップページの fastfetch 風 hero に出す ASCII アートを、アバター画像から生成する。
//   npm run ascii
// で src/data/asciiAvatar.ts を書き出す。画像を差し替えたら実行し直す。
//
// 縮小前に毛並みの陰影を除き、目・口・頬の暗い部分を残す。
// 縮小後の濃淡は、各文字の領域を暗い部分がどれだけ占めるかを表す。
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const SRC = "src/assets/toramutton.jpg";
const OUT = "src/data/asciiAvatar.ts";
// 文字の縦横比(約 1:2)を補正し、細い曲線が読める解像度にする。
const COLS = 64;
const ROWS = 32;
const FACE_COLS = 52;
const FACE_ROWS = 26;
const FACE_RADIUS = FACE_COLS / COLS;
const FRAME_CHARS = " .:-=+";
const FRAME_SAMPLES = 4;
const CHARS = " .:-=+*#%@";
const INK_THRESHOLD = 110;
// 細い口の線も、小さな表示で読める濃さにする。
const INK_GAMMA = 0.7;

// 先に縮小すると口と黄色い生地が混ざるため、原寸で二値化を完了させる。
const mask = await sharp(SRC)
  .median(5)
  .grayscale()
  .threshold(INK_THRESHOLD)
  .raw()
  .toBuffer({ resolveWithObject: true });

const { data } = await sharp(mask.data, { raw: mask.info })
  .resize(FACE_COLS, FACE_ROWS, { fit: "fill", kernel: "mitchell" })
  .grayscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

// 円の外側に、両端へ向かって細く消える弧を対角に添える。
// セル内を細かくサンプリングし、斜線の段差を濃淡でなめらかにする。
function frameCoverage(x, y) {
  let coverage = 0;
  for (let sy = 0; sy < FRAME_SAMPLES; sy++) {
    for (let sx = 0; sx < FRAME_SAMPLES; sx++) {
      const nx = (x + (sx + 0.5) / FRAME_SAMPLES - COLS / 2) / (COLS / 2);
      const ny = (y + (sy + 0.5) / FRAME_SAMPLES - ROWS / 2) / (ROWS / 2);
      const radius = Math.hypot(nx, ny);
      const angle = Math.atan2(ny, nx);
      const ring = Math.max(0, 1 - Math.abs(radius - 0.88) / 0.015);
      const taper = Math.sin(angle + Math.PI * 0.92) ** 6;
      const arc = taper * Math.max(0, 1 - Math.abs(radius - 0.975) / 0.015);
      coverage += Math.max(ring * 0.8, arc);
    }
  }
  return coverage / FRAME_SAMPLES ** 2;
}

const lines = [];
for (let y = 0; y < ROWS; y++) {
  let row = "";
  for (let x = 0; x < COLS; x++) {
    const nx = (x + 0.5 - COLS / 2) / (COLS / 2);
    const ny = (y + 0.5 - ROWS / 2) / (ROWS / 2);
    if (Math.hypot(nx, ny) < FACE_RADIUS) {
      const sourceX = x - (COLS - FACE_COLS) / 2;
      const sourceY = y - (ROWS - FACE_ROWS) / 2;
      const coverage = 1 - data[sourceY * FACE_COLS + sourceX] / 255;
      row += CHARS[Math.round(coverage ** INK_GAMMA * (CHARS.length - 1))];
    } else {
      const coverage = Math.sqrt(frameCoverage(x, y));
      row += FRAME_CHARS[Math.round(coverage * (FRAME_CHARS.length - 1))];
    }
  }
  // 空行にも空白を残し、表示側の span の高さと顔の縦横比を保つ。
  lines.push(row.trimEnd() || " ");
}

const body = `// scripts/ascii-avatar.mjs が生成するファイル。手で編集しない。
// 元画像: ${SRC}(${COLS} 列 × ${ROWS} 行)
export const asciiAvatar: string[] = ${JSON.stringify(lines, null, 2)};
`;
await writeFile(OUT, body);
console.log(lines.join("\n"));
console.log(`\nwrote ${OUT}`);
