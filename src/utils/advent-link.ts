// アドベントカレンダーへのリンク(「Advent 2026 →」)を出す期間の判定。
// トップの Blog セクションと /blog の見出し行で共有する。
// (カレンダー本体の日付計算は advent.ts)
import { advent2026 } from "../data/advent2026";

/** この日(JST)を過ぎたビルドからは、リンクを出さない(開催年の翌年 1/10) */
const ADVENT_UNTIL = new Date(`${advent2026.year + 1}-01-10T00:00:00+09:00`);

export const showAdventLink = () => new Date() < ADVENT_UNTIL;
export const adventHref = `/advent${advent2026.year}`;
export const adventLabel = `Advent ${advent2026.year}`;
