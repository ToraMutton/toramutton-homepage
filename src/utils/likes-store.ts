// いいねの数の保存先。サーバー側(API ルート)だけが使う。
//
//   本番 … Upstash Redis を REST API(HTTP)で呼ぶ。ライブラリは足していない
//   dev  … 接続情報がなければメモリに数える(サーバーを止めると消える)
//   本番で接続情報がない … 機能ごと無効(画面にボタンを出さない)
//
// 保存するのは「記事ごとの数」だけ。IP などの閲覧者の情報は持たない。

// 接続情報は実行時の process.env から読む。import.meta.env はビルド時に値が埋め込まれるので使わない。
// Vercel の連携は KV_REST_API_URL / KV_REST_API_TOKEN という名前で入れる。
// 連携時に接頭辞を付けた場合(STORAGE_KV_REST_API_URL など)も拾う。
function findEnv(name: string): string | undefined {
  return process.env[name] ?? Object.entries(process.env).find(([key]) => key.endsWith(`_${name}`))?.[1];
}

function credentials() {
  const url = findEnv("KV_REST_API_URL") ?? findEnv("UPSTASH_REDIS_REST_URL");
  const token = findEnv("KV_REST_API_TOKEN") ?? findEnv("UPSTASH_REDIS_REST_TOKEN");
  return url && token ? { url, token } : undefined;
}

/** プレビュー環境で押した分が、本番の数に混ざらないようにする */
function keyOf(slug: string): string {
  const env = process.env.VERCEL_ENV;
  return env && env !== "production" ? `likes:${env}:${slug}` : `likes:${slug}`;
}

/** Redis のコマンドを 1 つ送る。例: ["INCR", "likes:why"] */
async function command(args: string[]): Promise<unknown> {
  const { url, token } = credentials()!;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(3000),
  });
  const data = (await response.json()) as { result?: unknown; error?: string };
  if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data.result;
}

const memory = new Map<string, number>();

export const likesEnabled = (): boolean => credentials() !== undefined || import.meta.env.DEV;

export async function getLikes(slug: string): Promise<number> {
  if (!credentials()) return memory.get(keyOf(slug)) ?? 0;
  // まだ一度も押されていない記事は null が返る
  return Number((await command(["GET", keyOf(slug)])) ?? 0);
}

export async function addLike(slug: string, delta: 1 | -1): Promise<number> {
  const key = keyOf(slug);
  if (!credentials()) {
    const next = Math.max(0, (memory.get(key) ?? 0) + delta);
    memory.set(key, next);
    return next;
  }
  const next = Number(await command([delta === 1 ? "INCR" : "DECR", key]));
  if (next >= 0) return next;
  await command(["SET", key, "0"]); // 0 より下にはしない
  return 0;
}
