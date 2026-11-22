// GitHub の contribution(草)をビルド時に取得する。
// 公式 API はトークンが要るので、公開プロフィールから集計してくれる jogruber の API を使う。
// 取得に失敗してもページ全体は壊さず、空のデータを返す(草が出ないだけになる)。

export interface ContributionDay {
  date: string;
  count: number;
  /** 0〜4。GitHub の草の濃さと同じ段階 */
  level: number;
}

export interface Contributions {
  days: ContributionDay[];
  /** 直近1年の合計 */
  total: number;
}

const ENDPOINT = "https://github-contributions-api.jogruber.de/v4/toramutton?y=last";

export async function getContributions(): Promise<Contributions> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      days: data.contributions ?? [],
      total: data.total?.lastYear ?? 0,
    };
  } catch (e) {
    console.error("GitHub contributions fetch failed", e);
    return { days: [], total: 0 };
  }
}
