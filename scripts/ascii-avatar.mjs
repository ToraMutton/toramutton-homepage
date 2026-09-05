// トップページの fastfetch 風 hero に出す ASCII アートを、アバター画像から生成する。
//   npm run ascii
// で src/data/asciiAvatar.ts を書き出す。画像を差し替えたら実行し直す。
//
// 黄色い顔の面は空白に落として、輪郭・目・口だけが文字として残るように
// 明るさの閾値を高めにしている(CHARS の先頭が空白)。
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const SRC = "src/assets/toramutton.jpg";
const OUT = "src/data/asciiAvatar.ts";
const COLS = 40;
// 文字の縦横比(約 1:2)に合わせて行数は列数の半分
const ROWS = Math.round(COLS / 2);
// 暗い → 濃い文字。先頭 3 つが「ほぼ白」扱いになるよう空白を厚めに取る
const CHARS = "   .,:;i1tfLCG08@";

const { data } = await sharp(SRC)
  .resize(COLS, ROWS, { fit: "fill" })
  .grayscale()
  .normalise()
  .raw()
  .toBuffer({ resolveWithObject: true });

const chars = [...CHARS];
const lines = [];
for (let y = 0; y < ROWS; y++) {
  let row = "";
  for (let x = 0; x < COLS; x++) {
    const v = data[y * COLS + x];
    row += chars[Math.round((1 - v / 255) * (chars.length - 1))];
  }
  lines.push(row.trimEnd());
}

const body = `// scripts/ascii-avatar.mjs が生成するファイル。手で編集しない。
// 元画像: ${SRC}(${COLS} 列 × ${ROWS} 行)
export const asciiAvatar: string[] = ${JSON.stringify(lines, null, 2)};
`;
await writeFile(OUT, body);
console.log(lines.join("\n"));
console.log(`\nwrote ${OUT}`);
