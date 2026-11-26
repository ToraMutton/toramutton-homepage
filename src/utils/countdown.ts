// Countdown カードの日付計算。
// ビルド時(index.astro の frontmatter)とブラウザ側(<script>)の両方から使う。
//
// 日付はすべて「JST のカレンダー上の日付」で数える。
// Vercel のビルドサーバーは UTC で動いているので、new Date("2026-12-31") の
// ような書き方だと UTC 基準になって1日ずれることがある。そこで
// 「今日は JST で何年何月何日か」を文字列で取り出してから日数差を出している。

const DAY_MS = 1000 * 60 * 60 * 24;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** いま JST で何日か("YYYY-MM-DD") */
export function todayJST(now: Date = new Date()): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" 同士の日数差(to - from)。時刻もタイムゾーンも関係なく日付だけで数える */
export function daysBetween(from: string, to: string): number {
  const toUTC = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

// =====================================================
// Countdown カード
// =====================================================

export interface MissionInput {
  /** 毎年のイベントなら開催年を受け取って作る関数にもできる(年齢を入れたいとき用) */
  title: string | ((year: number) => string);
  /** 一回きり: "YYYY-MM-DD" / 毎年(repeat: "yearly"): "MM-DD" */
  date: string;
  repeat?: "yearly";
}

/**
 * 表示する日付を決める。
 * - 一回きり: そのまま
 * - 毎年: 今年の日付がまだ来ていなければ今年、過ぎていたら来年
 */
export function resolveMissionDate(m: MissionInput, today: string): string {
  if (m.repeat !== "yearly") return m.date;
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-${m.date}`;
  return daysBetween(today, thisYear) >= 0 ? thisYear : `${year + 1}-${m.date}`;
}
