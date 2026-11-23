// トップの Works に使う「重なるカルーセル(coverflow 風)」の動き。
//
// すべてを 1 つの数値 pos(「いま中心にいる位置」。2.0 なら 3 枚目が真ん中、2.3 ならそこから 0.3 枚ぶん動いてる)で決める。
// 各カードは d = i - pos(中心からの距離)だけから、位置・拡大率・暗さが計算される。
//
//   d = 0     真ん中。最大・くっきり
//   d = ±1    少し小さく暗く、真ん中の陰に半分隠れる
//   d = ±2,3… もっと小さく暗く、外へ向かうほど溶けていく
//
// 矢印・ドラッグ・スワイプ・キー・目盛りクリック・横向きホイールは、どれも pos の「行き先(goal)」を
// 変えるだけ。pos は goal へなめらかに近づくので、操作の種類によらず同じ動きになる。
// 縦のホイールは触らない(ページのスクロールを奪わない)。

export interface CoverflowOptions {
  /** ポインター操作(ドラッグ・ホイール・キー)を受ける枠 */
  stage: HTMLElement;
  /** 並べるカード。この順が並び順 */
  cards: HTMLElement[];
  /** 中心のカードが変わったときに呼ばれる(開始直後にも 1 回) */
  onChange?: (index: number) => void;
}

export interface CoverflowHandle {
  readonly index: number;
  go(index: number): void;
  prev(): void;
  next(): void;
  destroy(): void;
}

/** 隣のカードの中心までの距離(カード幅の倍数)。1 枚動かすのに必要なドラッグ量でもある */
const NEIGHBOR = 0.8;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 中心からの距離 d に対する、カードの位置(カード幅の倍数)・拡大率・暗さ・透明度 */
function placement(d: number) {
  const a = Math.abs(d);
  const sign = d < 0 ? -1 : 1;
  // 外へ行くほど間隔を詰める(1 枚目 0.8、2 枚目 1.4、3 枚目 1.9、…)
  const x = a <= 1 ? NEIGHBOR * a : a <= 2 ? NEIGHBOR + 0.6 * (a - 1) : 1.4 + 0.5 * (a - 2);
  return {
    x: sign * x,
    scale: 1 - 0.11 * Math.min(a, 3.5),
    // 透明にすると重なった奥のカードが透けて汚いので、不透明のまま背景色を被せて暗く見せる
    dim: a / (a + 1.6),
    // 画面外に近いものだけ本当に透明にして描画を止める
    opacity: a <= 3 ? 1 : Math.max(0, 4 - a),
    z: Math.round(100 - a * 10),
  };
}

export function mountCoverflow({ stage, cards, onChange }: CoverflowOptions): CoverflowHandle {
  const n = cards.length;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let pos = 0;
  let goal = 0;
  let width = cards[0]?.offsetWidth ?? 0;
  let current = -1;
  let raf = 0;
  let last = 0;

  // ---- 描画 ----
  const render = () => {
    cards.forEach((card, i) => {
      const p = placement(i - pos);
      card.style.transform = `translate3d(${(p.x * width).toFixed(2)}px, 0, 0) scale(${p.scale.toFixed(4)})`;
      card.style.opacity = String(p.opacity);
      card.style.zIndex = String(p.z);
      card.style.setProperty("--dim", p.dim.toFixed(3));
      // 見えていないカードは当たり判定も描画もなくす
      card.style.visibility = p.opacity < 0.01 ? "hidden" : "visible";
    });
    const index = clamp(Math.round(pos), 0, n - 1);
    if (index !== current) {
      current = index;
      onChange?.(index);
    }
  };

  // ---- アニメーション(pos を goal へ指数的に近づける。ドラッグ中は指に追従) ----
  let dragging = false;
  const tick = (t: number) => {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (t - last) / 1000));
    last = t;
    if (!dragging) {
      pos += (goal - pos) * (1 - Math.exp(-dt / 0.085));
      if (Math.abs(goal - pos) < 0.0008) pos = goal;
    }
    render();
    if (dragging || pos !== goal) raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const go = (index: number) => {
    goal = clamp(Math.round(index), 0, n - 1);
    if (reduceMotion.matches) {
      pos = goal;
      render();
    } else {
      kick();
    }
  };

  // ---- ドラッグ / スワイプ ----
  // 端を越えて引くとゴムのように重くなる
  const rubber = (p: number) =>
    p < 0 ? p * 0.35 : p > n - 1 ? n - 1 + (p - (n - 1)) * 0.35 : p;

  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let startPos = 0;
  let moved = false; // 一定以上動いてドラッグが始まったか
  let suppressClick = false;
  let samples: { t: number; x: number }[] = [];

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointerId !== -1) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startPos = pos;
    moved = false;
    samples = [{ t: e.timeStamp, x: e.clientX }];
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved) {
      // 6px 動くまではクリックかもしれないので何もしない。縦に動いたら横ドラッグではない
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
      moved = true;
      dragging = true;
      stage.setPointerCapture(pointerId);
      stage.classList.add("is-dragging");
      kick();
    }
    samples.push({ t: e.timeStamp, x: e.clientX });
    if (samples.length > 6) samples.shift();
    pos = rubber(startPos - dx / (width * NEIGHBOR));
  };

  const endDrag = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = -1;
    if (!moved) return;
    dragging = false;
    stage.classList.remove("is-dragging");
    suppressClick = true; // 指を離した直後の click は、リンクなどに届かせない
    setTimeout(() => (suppressClick = false), 0);

    // 離す直前の速さ(枚/秒)から、勢いで何枚先に行くかを決める
    const first = samples.find((s) => e.timeStamp - s.t < 120) ?? samples[0];
    const dt = Math.max(1, e.timeStamp - first.t);
    const velocity = -((e.clientX - first.x) / dt) * 1000 / (width * NEIGHBOR);
    go(clamp(pos + velocity * 0.18, pos - 2, pos + 2));
  };

  // ---- クリック: 脇のカードは真ん中へ呼ぶ。ドラッグ直後は無視 ----
  const onClick = (e: MouseEvent) => {
    if (suppressClick) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-coverflow-card]");
    const i = card ? cards.indexOf(card) : -1;
    if (i !== -1 && i !== current) {
      e.preventDefault();
      go(i);
    }
  };

  // ---- 横向きのホイール / トラックパッド: 1 回の操作で 1 枚 ----
  let wheelAt = 0;
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // 縦はページのスクロールに任せる
    e.preventDefault(); // 横スワイプでブラウザの「戻る」が発動するのも防ぐ
    if (e.timeStamp - wheelAt < 380 || Math.abs(e.deltaX) < 6) return;
    wheelAt = e.timeStamp;
    go(current + Math.sign(e.deltaX));
  };

  // ---- キーボード ----
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== stage) return; // カード内のリンクなどにフォーカスがあるときは触らない
    if (e.key === "ArrowLeft") go(current - 1);
    else if (e.key === "ArrowRight") go(current + 1);
    else return;
    e.preventDefault();
  };

  // 画像やリンクのブラウザ標準ドラッグ(ゴースト画像)がスワイプを邪魔するので止める
  const onDragStart = (e: Event) => e.preventDefault();

  const resize = new ResizeObserver(() => {
    width = cards[0]?.offsetWidth ?? width;
    render();
  });
  resize.observe(cards[0]);

  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("click", onClick, true);
  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("keydown", onKeyDown);
  stage.addEventListener("dragstart", onDragStart);

  render();

  return {
    get index() {
      return current;
    },
    go,
    prev: () => go(current - 1),
    next: () => go(current + 1),
    destroy() {
      cancelAnimationFrame(raf);
      resize.disconnect();
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", endDrag);
      stage.removeEventListener("pointercancel", endDrag);
      stage.removeEventListener("click", onClick, true);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("keydown", onKeyDown);
      stage.removeEventListener("dragstart", onDragStart);
    },
  };
}
