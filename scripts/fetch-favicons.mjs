/**
 * 相互リンクのアイコンを整えるスクリプト。
 *
 *   npm run favicons
 *
 * src/data/links.json を見て、2つのことをやる。
 *
 *   [1] "icon" にパスが書いてある（手動指定）→ その画像を 64px の WebP に縮小する。
 *       public/ の中身は Astro が最適化してくれないので、ここで小さくしておく。
 *       縮小済みのものは飛ばすので、何度実行しても画質は劣化しない。
 *
 *   [2] "icon": null（自動取得）→ 相手サイトから favicon を拾って
 *       public/favicons/auto/ に縮小保存し、URL → パスの対応表を
 *       src/data/favicon-map.json に書き出す。
 *
 * ビルド時にネットへ出ないようにするための事前準備スクリプトなので、
 * 実行後は public/favicons/ と links.json / favicon-map.json をコミットすること。
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const LINKS_PATH = path.join(ROOT, "src/data/links.json");
const MAP_PATH = path.join(ROOT, "src/data/favicon-map.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_DIR = path.join(ROOT, "public/favicons/auto");
const PUBLIC_PREFIX = "/favicons/auto";

const TIMEOUT = 8000;
const MAX_BYTES = 512 * 1024; // 元画像の上限。縮小するので緩めでよい
const ICON_SIZE = 64; // 表示は32pxなので Retina 用に2倍

const UA =
  "Mozilla/5.0 (compatible; toramutton.me/1.0; +https://toramutton.me)";

// ---- fetch (タイムアウト付き) ----
async function get(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- マジックバイトでMIME判定（HTMLエラーページを弾く役割も兼ねる）----
function sniffMime(buf) {
  if (buf.length < 8) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  if (buf[0] === 0x00 && buf[1] === 0x00 && (buf[2] === 0x01 || buf[2] === 0x02))
    return "image/x-icon";
  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";

  const head = buf.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg")))
    return "image/svg+xml";

  return null; // ← HTMLが返ってきた場合はここで null
}

// ---- <head> から icon 系 <link> を抽出してスコアリング ----
function extractIconHrefs(html, baseUrl) {
  const head = html.split(/<\/head>/i)[0] ?? html.slice(0, 50000);
  const cands = [];

  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    if (!/(^|\s)(shortcut\s+)?icon(\s|$)|apple-touch-icon/.test(rel)) continue;
    if (rel.includes("mask-icon")) continue; // 単色マスクなので不採用

    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || href.startsWith("data:")) continue;

    const sizes = /sizes\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    const px = parseInt(sizes, 10) || 0;

    let score = 0;
    if (/\.svg(\?|$)/i.test(href)) score += 120; // ベクタが最優先
    else if (/\.png(\?|$)/i.test(href)) score += 60;
    if (rel.includes("apple-touch-icon")) score += 20;
    score += Math.min(px, 512) / 8; // 大きいほど有利

    try {
      cands.push({ href: new URL(href, baseUrl).href, score });
    } catch {
      /* 不正なhrefは無視 */
    }
  }

  return cands.sort((a, b) => b.score - a.score).map((c) => c.href);
}

/** ページURLから favicon の実体（Buffer + MIME）を探す */
async function resolveIcon(pageUrl) {
  const candidates = [];

  const page = await get(pageUrl);
  if (page) candidates.push(...extractIconHrefs(page.toString("utf8"), pageUrl));

  // 定番パスも総当たり（ページと同階層 → オリジン直下）
  try {
    const origin = new URL(pageUrl).origin;
    candidates.push(
      new URL("./favicon.ico", pageUrl).href,
      `${origin}/favicon.ico`,
      `${origin}/favicon.png`,
      `${origin}/favicon.svg`,
      `${origin}/apple-touch-icon.png`,
    );
  } catch {
    return null;
  }

  for (const href of [...new Set(candidates)]) {
    const buf = await get(href);
    if (!buf || buf.length === 0 || buf.length > MAX_BYTES) continue;
    const mime = sniffMime(buf);
    if (!mime) continue;
    return { buf, mime };
  }
  return null;
}

/**
 * .ico は複数サイズの画像を1ファイルに束ねた独自形式で、sharp は直接読めない。
 * 一番大きい1枚だけ取り出して sharp が扱える形に変換する。
 * 中身は PNG がそのまま入っている場合と、BMP 相当の生ピクセルの場合がある。
 * 想定外の形式なら null を返し、呼び出し側で .ico のまま扱わせる。
 */
function unpackIco(buf) {
  if (buf.length < 6) return null;
  const count = buf.readUInt16LE(4);
  if (count === 0 || buf.length < 6 + count * 16) return null;

  // 一番大きいサイズのエントリを選ぶ（幅・高さの 0 は 256 を意味する）
  let best = null;
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16;
    const width = buf[o] || 256;
    const height = buf[o + 1] || 256;
    const size = buf.readUInt32LE(o + 8);
    const offset = buf.readUInt32LE(o + 12);
    if (offset + size > buf.length) continue;
    if (!best || width * height > best.width * best.height) {
      best = { width, height, offset, size };
    }
  }
  if (!best) return null;

  const body = buf.subarray(best.offset, best.offset + best.size);

  // ケース1: PNG がそのまま埋まっている
  if (body[0] === 0x89 && body[1] === 0x50) return sharp(body);

  // ケース2: BITMAPINFOHEADER + 生ピクセル。32bpp（BGRA）だけ対応する
  if (body.length < 40) return null;
  const headerSize = body.readUInt32LE(0);
  const bitCount = body.readUInt16LE(14);
  if (headerSize !== 40 || bitCount !== 32) return null;

  const { width, height } = best;
  const pixels = body.subarray(headerSize, headerSize + width * height * 4);
  if (pixels.length < width * height * 4) return null;

  // BMP は行が下から上に並び、色が BGRA 順なので RGBA に並べ替える
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    const dst = y * width * 4;
    for (let x = 0; x < width * 4; x += 4) {
      rgba[dst + x] = pixels[src + x + 2];
      rgba[dst + x + 1] = pixels[src + x + 1];
      rgba[dst + x + 2] = pixels[src + x];
      rgba[dst + x + 3] = pixels[src + x + 3];
    }
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } });
}

/**
 * 表示サイズに合わせて縮小する。
 * SVG は元々軽くて拡大に強いのでそのまま。
 */
async function optimize(buf, mime) {
  if (mime === "image/svg+xml") return { data: buf, ext: "svg" };

  let pipeline;
  if (mime === "image/x-icon") {
    pipeline = unpackIco(buf);
    // 解釈できない .ico はそのまま置く（表示はできるのでサイズだけ諦める）
    if (!pipeline) return { data: buf, ext: "ico" };
  } else {
    pipeline = sharp(buf);
  }

  try {
    const data = await pipeline
      .resize(ICON_SIZE, ICON_SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 82 })
      .toBuffer();
    return { data, ext: "webp" };
  } catch {
    return null;
  }
}

/** ホスト名からファイル名を作る（例: blog.lizelit.workers.dev → blog.lizelit.workers.dev.webp） */
function baseNameOf(pageUrl) {
  const host = new URL(pageUrl).hostname.replace(/^www\./, "");
  return host.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/**
 * [1] 手動指定アイコンの縮小。
 * public/ に置いた画像は Astro の最適化が効かず原寸のまま配信されるので、
 * ここで 64px の WebP に落としておく。拡張子が変わった分は links.json に反映する。
 * @returns links.json を書き換えたか
 */
async function optimizeManualIcons(links) {
  let changed = false;
  let before = 0;
  let after = 0;
  let done = 0;

  for (const link of links) {
    const icon = link.icon;
    if (!icon || !icon.startsWith("/favicons/")) continue;

    const filePath = path.join(PUBLIC_DIR, icon);
    let buf;
    try {
      buf = await fs.readFile(filePath);
    } catch {
      console.warn(`  ✗ ${link.name} — ${icon} が見つかりません`);
      continue;
    }

    const mime = sniffMime(buf);
    if (!mime) {
      console.warn(`  ✗ ${link.name} — 画像として読めませんでした（${icon}）`);
      continue;
    }
    if (mime === "image/svg+xml") continue; // ベクタなので縮小しない

    // すでに縮小済みなら触らない。再実行のたびに再圧縮して劣化するのを防ぐ
    if (mime === "image/webp") {
      const meta = await sharp(buf)
        .metadata()
        .catch(() => null);
      if (meta && meta.width <= ICON_SIZE && meta.height <= ICON_SIZE) continue;
    }

    const optimized = await optimize(buf, mime);
    if (!optimized || optimized.ext !== "webp") {
      console.warn(`  ✗ ${link.name} — 変換できませんでした（${mime}）`);
      continue;
    }

    const newIcon = `${icon.replace(/\.[^./]+$/, "")}.${optimized.ext}`;
    await fs.writeFile(path.join(PUBLIC_DIR, newIcon), optimized.data);
    if (newIcon !== icon) {
      await fs.rm(filePath); // 拡張子が変わったので元ファイルは不要
      link.icon = newIcon;
      changed = true;
    }

    before += buf.length;
    after += optimized.data.length;
    done++;
    console.log(
      `  ✓ ${link.name} — ${kb(buf.length)} → ${kb(optimized.data.length)}  ${path.basename(newIcon)}`,
    );
  }

  if (done === 0) console.log("  すべて最適化済みでした");
  else console.log(`  合計 ${kb(before)} → ${kb(after)}`);

  return changed;
}

async function main() {
  const links = JSON.parse(await fs.readFile(LINKS_PATH, "utf8"));
  const manualCount = links.filter((l) => l.icon).length;
  const targets = links.filter((l) => !l.icon);

  console.log(`[1/2] 手動アイコンの縮小 — ${manualCount} 件`);
  if (await optimizeManualIcons(links)) {
    await fs.writeFile(LINKS_PATH, `${JSON.stringify(links, null, 2)}\n`);
    console.log("  links.json のパスを更新しました");
  }

  console.log(`\n[2/2] favicon の自動取得 — ${targets.length} 件`);

  /** 前回の結果。取得に失敗したサイトは前回のアイコンを使い続ける */
  let prevMap = {};
  try {
    prevMap = JSON.parse(await fs.readFile(MAP_PATH, "utf8"));
  } catch {
    /* 初回は空 */
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  const map = {};
  let totalBefore = 0;
  let totalAfter = 0;

  for (const link of targets) {
    const found = await resolveIcon(link.url);
    if (!found) {
      console.warn(`  ✗ ${link.name} — アイコンが見つかりませんでした`);
      if (prevMap[link.url]) map[link.url] = prevMap[link.url];
      continue;
    }

    const optimized = await optimize(found.buf, found.mime);
    if (!optimized) {
      console.warn(`  ✗ ${link.name} — 画像を変換できませんでした（${found.mime}）`);
      if (prevMap[link.url]) map[link.url] = prevMap[link.url];
      continue;
    }

    const fileName = `${baseNameOf(link.url)}.${optimized.ext}`;
    await fs.writeFile(path.join(OUT_DIR, fileName), optimized.data);
    map[link.url] = `${PUBLIC_PREFIX}/${fileName}`;

    totalBefore += found.buf.length;
    totalAfter += optimized.data.length;
    console.log(
      `  ✓ ${link.name} — ${kb(found.buf.length)} → ${kb(optimized.data.length)}  ${fileName}`,
    );
  }

  // 使われなくなったファイルを掃除
  const keep = new Set(Object.values(map).map((p) => path.basename(p)));
  for (const file of await fs.readdir(OUT_DIR)) {
    if (!keep.has(file)) {
      await fs.rm(path.join(OUT_DIR, file));
      console.log(`  - ${file} を削除（不要になったため）`);
    }
  }

  // キーの順序を安定させて差分を読みやすくする
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => (a < b ? -1 : 1)));
  await fs.writeFile(MAP_PATH, `${JSON.stringify(sorted, null, 2)}\n`);

  console.log(`  合計 ${kb(totalBefore)} → ${kb(totalAfter)}`);
  console.log("  対応表を書き出しました: src/data/favicon-map.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
