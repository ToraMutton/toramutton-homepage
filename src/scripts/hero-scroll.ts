// ヒーローのスクロール連動(トップと /about で共通)。
//
// しくみ
//   .hero-track は画面より縦長で、その中の .hero が sticky で画面に張り付く。
//   張り付いている間のスクロール量を進捗 p(0〜1)にして、.hero に CSS 変数で渡す。
//     --p … 進捗そのもの(文字やアイコンを消すのに使う)
//     --e … ゆっくり始まりゆっくり終わる曲線にかけた値(三角形を広げるのに使う)
//   拡大率などの計算は CSS 側で行う。
//   p > coveredAt になったら .is-covered を付ける(消えたリンクを押せなくするため)。

/** 0→1 を、ゆっくり始まりゆっくり終わる曲線にする(easeInOutCubic) */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export interface HeroScrollOptions {
  track: HTMLElement;
  hero: HTMLElement;
  /** 進捗がこれを超えたら .is-covered を付ける */
  coveredAt?: number;
  /** 進捗が変わるたびに呼ばれる(p は 0〜1) */
  onProgress?: (p: number) => void;
}

/** スクロールとリサイズを監視する。戻り値の関数で解除する */
export function bindHeroScroll({ track, hero, coveredAt = 0.4, onProgress }: HeroScrollOptions): () => void {
  let queued = false;

  const update = () => {
    queued = false;
    const distance = track.offsetHeight - window.innerHeight;
    const raw = distance > 0 ? -track.getBoundingClientRect().top / distance : 0;
    const p = Math.min(1, Math.max(0, raw));
    hero.style.setProperty("--p", p.toFixed(4));
    hero.style.setProperty("--e", ease(p).toFixed(4));
    hero.classList.toggle("is-covered", p > coveredAt);
    onProgress?.(p);
  };
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();

  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
  };
}
