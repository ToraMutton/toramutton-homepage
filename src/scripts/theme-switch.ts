// テーマ切り替えと、その演出(色がじわっと混ざるだけのシンプルなフェード)。
//
// しくみ
//   切り替えの間だけ <html> に .theme-fading を付け、ページ内のすべての要素の
//   色(背景・文字・線・塗り)に同じ長さのトランジションを掛ける(global.css)。
//   その状態でテーマを切り替えると、各要素の色が旧テーマ → 新テーマへ徐々に混ざる。
//   上に何かを重ねるわけではないので、文字が一瞬消えたりちらついたりしない。
//
// WebGL のメビウスには CSS のトランジションが効かないので、mobius.ts 側で
// 同じ長さ(THEME_FADE_MS)だけ色を補間している。

export type Theme = "dark" | "light";

/** フェードの長さ。global.css の .theme-fading もこの値に合わせる */
export const THEME_FADE_MS = 600;

let timer = 0;

export function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function switchTheme(next: Theme) {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduceMotion) {
    root.classList.add("theme-fading");
    clearTimeout(timer);
    timer = window.setTimeout(() => root.classList.remove("theme-fading"), THEME_FADE_MS + 50);
  }

  root.classList.toggle("dark", next === "dark");
  localStorage.setItem("theme", next);
}
