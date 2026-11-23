// トップページの「今いるセクション」の判定。
// 左の波形(FourierRail)と右の現在位置バー(SectionRail)が同じ答えを出すよう、ここ 1 か所にまとめる。
//
//   現在地 = 「画面の縦中央より上に頭が出ている、いちばん下のセクション」
//
// スクロール位置から毎回計算するので、End キーなどで一気に飛んでも、
// 画面の中央がフッターに入っても、最後のセクション(others)のままになる。
// (IntersectionObserver で「中央をまたぐセクション」を見る方式だと、
//  どのセクションも中央をまたがない位置へ飛んだときに通知が来ず、古い状態が残った)

/** 上から順。"top" はヒーロー(要素は見ず、どのセクションも中央に届いていなければ top) */
export const SECTION_IDS = ["top", "works", "blog", "about", "others"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** いま現在地になっているセクションの id を返す */
export function currentSection(): SectionId {
  const center = window.innerHeight / 2;
  let current: SectionId = "top";
  for (const id of SECTION_IDS) {
    if (id === "top") continue;
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top <= center) current = id;
  }
  return current;
}

/**
 * 現在地を監視する。始めた直後に 1 回、そのあとは変わったときだけ onChange を呼ぶ。
 * 戻り値の関数で監視をやめる。
 */
export function watchCurrentSection(onChange: (id: SectionId) => void): () => void {
  let current: SectionId | null = null;
  let raf = 0;

  const update = () => {
    raf = 0;
    const id = currentSection();
    if (id === current) return;
    current = id;
    onChange(id);
  };
  const request = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  update();

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("scroll", request);
    window.removeEventListener("resize", request);
  };
}
