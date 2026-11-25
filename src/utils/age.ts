// 年齢の計算。ビルド時(Astro の frontmatter)とブラウザ側(<script>)の両方から使う。
// 日付は utils/countdown.ts と同じく「JST のカレンダー上の日付」で数える。

/** "YYYY-MM-DD" の誕生日から、today("YYYY-MM-DD")時点の満年齢を返す */
export function ageOn(birthday: string, today: string): number {
  const [by, bm, bd] = birthday.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  // 今年の誕生日がまだ来ていなければ 1 つ引く
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** "YYYY-MM-DD" → "YYYY.MM.DD" */
export const dotDate = (d: string) => d.replaceAll("-", ".");
