/**
 * 指定したURL先のHTMLを取得し、`<meta property="og:image" content="...">` のURLを抽出して返す
 * @param url 取得先のURL
 * @returns og:imageのURL。取得に失敗、または存在しない場合はundefined
 */
export async function fetchOgpImage(url: string): Promise<string | undefined> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'ToraMutton-Homepage/1.0',
            },
            signal: AbortSignal.timeout(5000), // 5秒でタイムアウトさせる
        });

        if (!response.ok) {
            return undefined;
        }

        const html = await response.text();
        const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);

        return match ? match[1] : undefined;
    } catch (e) {
        console.error(`OGP image fetch failed for ${url}:`, e);
        return undefined;
    }
}
