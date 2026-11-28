/**
 * サイトの丸アイコンを作るスクリプト。
 *
 *   npm run icon
 *
 * src/assets/profile/toramutton.png を円形に切り抜いて、2つ書き出す。
 * icon.png は全身、favicon.png は顔の寄り(face-crop.mjs)。
 *
 *   public/icon.png    … /links の Connect で配るアイコン。
 *                        相手のサイトが直接参照するので、この名前と場所は変えない
 *   public/favicon.png … ブラウザのタブに出るアイコン。404 のミニゲームの自機にも使う
 *
 * 元の絵を差し替えたときだけ実行して、public/ の2枚をコミットする。
 */
import path from "node:path";
import sharp from "sharp";
import { FACE_CROP } from "./face-crop.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "src/assets/profile/toramutton.png");
const OUTPUTS = [
  { file: "public/icon.png", size: 400 },
  // 128px はミニゲームの自機(最大 42px)を高精細な画面でもにじませないため
  { file: "public/favicon.png", size: 128, crop: FACE_CROP },
];

for (const { file, size, crop } of OUTPUTS) {
  const r = size / 2;
  // 白い円の部分だけを残す型抜き(dest-in)。外側は透明になる
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}"/></svg>`,
  );
  const source = sharp(SOURCE);
  if (crop) source.extract(crop);
  const info = await source
    .resize(size, size)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    // 直接参照されるので軽くしておく。256色に減色すると写真でも見分けがつかない程度で数分の一になる
    .png({ palette: true, quality: 90, effort: 10 })
    .toFile(path.join(ROOT, file));
  console.log(`  ${file} (${size}px, ${(info.size / 1024).toFixed(1)} KB)`);
}
