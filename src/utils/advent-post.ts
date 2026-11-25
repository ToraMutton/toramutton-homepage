// ローカル記事がアドベントカレンダーの記事かどうか。
// タグではなく data/advent2026.ts の割り当てを正とする(カレンダーに登録すれば自動で付く)。
import { advent2026 } from "../data/advent2026";

/** カレンダーの記事なら「Day 5」「Prologue」などの呼び名、違えば undefined */
export function adventLabelOf(id: string): string | undefined {
  const is = (link: (typeof advent2026.prologue)["link"]) => link?.type === "blog" && link.slug === id;
  if (is(advent2026.prologue.link)) return "Prologue";
  if (is(advent2026.epilogue.link)) return "Epilogue";
  const day = advent2026.days.find((entry) => is(entry.link));
  return day ? `Day ${day.day}` : undefined;
}
