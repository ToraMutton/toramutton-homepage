import fs from "node:fs/promises";
import path from "node:path";

const CACHE_PATH = path.resolve("./.cache/favicons.json");
const TTL = 1000 * 60 * 60 * 24 * 7; // 7日
const TIMEOUT = 8000;
const MAX_BYTES = 64 * 1024; // 64KB超のicoは弾く

const UA =
  "Mozilla/5.0 (compatible; toramutton.me/1.0; +https://toramutton.me)";

type Entry = { icon: string | null; fetchedAt: number };
type Cache = Record<string, Entry>;

let cache: Cache | null = null;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(CACHE_PATH, "utf8"));
  } catch {
    cache = {};
  }
  return cache!;
}

async function saveCache() {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
}

// ---- fetch (タイムアウト付き) ----
async function get(url: string): Promise<Buffer | null> {
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
function sniffMime(buf: Buffer): string | null {
  if (buf.length < 8) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  if (
    buf[0] === 0x00 &&
    buf[1] === 0x00 &&
    (buf[2] === 0x01 || buf[2] === 0x02)
  )
    return "image/x-icon";
  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";

  const head = buf.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (
    head.startsWith("<svg") ||
    (head.startsWith("<?xml") && head.includes("<svg"))
  )
    return "image/svg+xml";

  return null; // ← HTMLが返ってきた場合はここで null
}

// ---- <head> から icon 系 <link> を抽出してスコアリング ----
function extractIconHrefs(html: string, baseUrl: string): string[] {
  const head = html.split(/<\/head>/i)[0] ?? html.slice(0, 50000);
  const cands: { href: string; score: number }[] = [];

  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const rel =
      /rel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    if (!/(^|\s)(shortcut\s+)?icon(\s|$)|apple-touch-icon/.test(rel)) continue;
    if (rel.includes("mask-icon")) continue; // 単色マスクなので不採用

    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || href.startsWith("data:")) continue;

    const sizes = /sizes\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    const px = parseInt(sizes, 10) || 0;

    let score = 0;
    if (/\.svg(\?|$)/i.test(href))
      score += 120; // ベクタが最優先
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

async function resolve(pageUrl: string): Promise<string | null> {
  const candidates: string[] = [];

  const page = await get(pageUrl);
  if (page) {
    candidates.push(...extractIconHrefs(page.toString("utf8"), pageUrl));
  }

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
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
  return null;
}

export async function fetchFavicon(pageUrl: string): Promise<string | null> {
  const c = await loadCache();
  const hit = c[pageUrl];
  if (hit && Date.now() - hit.fetchedAt < TTL) return hit.icon;

  const icon = await resolve(pageUrl);
  // 取得失敗時は古いキャッシュを温存（相手サイトが一時的に落ちてる場合の保険）
  c[pageUrl] = { icon: icon ?? hit?.icon ?? null, fetchedAt: Date.now() };
  await saveCache();
  return c[pageUrl].icon;
}
