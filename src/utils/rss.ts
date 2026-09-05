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
        // note の data-* 属性や属性順の違いを許容する。
        const meta = html.match(/<meta\b[^>]*>/gi)?.find((tag) =>
            /\sproperty\s*=\s*(["'])og:image\1/i.test(tag),
        );
        const match = meta?.match(/\scontent\s*=\s*(["'])(.*?)\1/i);

        // Qiita などがクエリ区切りを &amp; として出力するため、URLに戻す。
        return match ? match[2].replace(/&amp;/g, '&') : undefined;
    } catch (e) {
        console.error(`OGP image fetch failed for ${url}:`, e);
        return undefined;
    }
}
