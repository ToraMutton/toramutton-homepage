// 左サイドの「フーリエ級数」波形。
//
//   f(θ) = Σ_{n=1}^{N} b_n · sin(nθ)
//
// 縦に伸びるレールに沿って θ を割り当て、f の値だけ左右に振って描く。
// 今いるセクションごとに係数 b_n の組(WAVES)が決まっていて、セクションが変わると
// 係数を少しずつ新しい組へ近づける。f は b_n について線形なので、
// 係数を補間するだけで「波形そのもの」がなめらかに変形していく。
//
//   2 本目の線は位相を π ずらしたもの。正弦波なら -f になり、2 本が交差して二重螺旋に見える。
//   travel = 1 で波が下へ流れ、0 でその場で振動する定常波になる。
//   damp > 0 で下へ行くほど振幅が減衰する(e^{-γy})。

export interface Wave {
  /** b_1 〜 b_15 */
  b: number[];
  /** ラベルに出す項数 N */
  N: number;
  /** 下へ行くほどの減衰の強さ γ(0 で減衰なし) */
  damp: number;
  /** 1: 下へ流れる進行波 / 0: その場で振動する定常波 */
  travel: number;
  /** ラベルに出す係数の式 */
  label: string;
}

const NMAX = 15;
const coeffs = (f: (n: number) => number) =>
  Array.from({ length: NMAX }, (_, i) => f(i + 1));

export const WAVES: Record<string, Wave> = {
  // 基本波。きれいな正弦波(2 本で二重螺旋)
  top: { b: coeffs((n) => (n === 1 ? 1 : 0)), N: 1, damp: 0, travel: 1, label: "b₁ = 1" },
  // 矩形波。奇数次だけを 1/n で足す。角の手前に出るヒゲがギブス現象
  works: {
    b: coeffs((n) => (n % 2 === 1 ? 1 / n : 0)),
    N: 15,
    damp: 0,
    travel: 1,
    label: "bₙ = 4/(nπ), n odd",
  },
  // 近い周波数どうしの干渉(うなり)
  blog: { b: coeffs((n) => (n === 5 || n === 6 ? 1 : 0)), N: 6, damp: 0, travel: 1, label: "b₅ = b₆ = 1" },
  // 下へ行くほど収束していく定常波
  about: { b: coeffs((n) => (n === 1 ? 1 : 0)), N: 1, damp: 2.2, travel: 0, label: "e⁻ᵞʸ sin y" },
  // ノコギリ波
  others: {
    b: coeffs((n) => (n % 2 === 1 ? 1 : -1) / n),
    N: 15,
    damp: 0,
    travel: 1,
    label: "bₙ = 2(-1)ⁿ⁺¹/(nπ)",
  },
};

export interface FourierHandle {
  setWave(key: string): void;
  destroy(): void;
}

const TAU = Math.PI * 2;
const CYCLES = 3.5; // レール全体に入る基本波の周期の数
const SPEED = 0.9; // 波が流れる速さ(rad/s)

// 波形が切り替わるときの「なめらかさ」。
// 係数・減衰・travel は、目標に向かって臨界減衰のばね(二次の追従)で近づく。
//   一次の指数的な近づき方(x += (目標 - x) × k)だと、動き出しの瞬間がいちばん速くて唐突になる。
//   ばねは速度から立ち上がるので、ゆっくり動き出して、ゆっくり止まる。
// OMEGA が小さいほど穏やか(だいたい 4.6 / OMEGA 秒で追いつく)。
const OMEGA = 2.2;

/** 係数の組から、1 周期ぶんの |f| の最大値を数値的に求める(振幅をそろえるため) */
function peak(b: number[]): number {
  let max = 0;
  for (let i = 0; i < 256; i++) {
    const th = (TAU * i) / 256;
    let f = 0;
    for (let n = 0; n < b.length; n++) f += b[n] * Math.sin((n + 1) * th);
    max = Math.max(max, Math.abs(f));
  }
  return max || 1;
}

export function mountFourier(canvas: HTMLCanvasElement, onLabel: (w: Wave) => void): FourierHandle | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 今の状態(補間中の値)
  let target = WAVES.top;
  const b = [...target.b];
  let norm = peak(b);
  let damp = target.damp;
  let travel = target.travel;
  // ばねの速度(b・damp・travel のそれぞれ)
  const bVel = new Array<number>(NMAX).fill(0);
  let dampVel = 0;
  let travelVel = 0;
  // 進行波の位相。「速さ × 時刻」ではなく、フレームごとに足していく。
  //   位相 = SPEED × t × travel だと、travel が変わった瞬間に位相が (t × 変化量) だけ飛んで、
  //   t が大きい(開いてから時間が経った)ほど、切り替え中に波が激しく暴れてしまう
  let phase = 0;

  let width = 0;
  let height = 0;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const ro = new ResizeObserver(() => {
    resize();
    draw(time);
  });
  ro.observe(canvas);
  resize();

  // y(0〜height)での f の値。進行波なら位相が時間で進み、定常波なら振幅が時間で揺れる
  const valueAt = (y: number, t: number, shift: number) => {
    const theta = (TAU * CYCLES * y) / height - phase + shift;
    let f = 0;
    for (let n = 0; n < NMAX; n++) {
      if (b[n] !== 0) f += b[n] * Math.sin((n + 1) * theta);
    }
    const standing = travel + (1 - travel) * Math.cos(SPEED * 1.6 * t);
    const envelope = Math.exp((-damp * y) / height);
    return (f / norm) * standing * envelope;
  };

  const draw = (t: number) => {
    if (height === 0) return;
    // 色は CSS の color から読む(テーマ切り替えのフェード中も自然に追従する)
    const color = getComputedStyle(canvas).color;
    const accent = getComputedStyle(canvas).getPropertyValue("--accent").trim();
    const cx = width / 2;
    const amp = width / 2 - 4;
    ctx.clearRect(0, 0, width, height);

    // 上下の端は細くフェードさせて、マスコットから「生えて」消えていくように見せる
    const strand = (shift: number, alpha: number, lineWidth: number) => {
      ctx.beginPath();
      for (let y = 0; y <= height; y += 2) {
        const x = cx + amp * valueAt(y, t, shift);
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = color;
      ctx.stroke();
    };
    strand(Math.PI, 0.4, 1);
    strand(0, 0.85, 1.4);

    // 波に沿って下へ流れる光の粒
    if (!reduceMotion) {
      const y = ((t * 60) % (height + 80)) - 40;
      if (y > 0 && y < height) {
        const x = cx + amp * valueAt(y, t, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  // ---- ループ ----
  let time = 0;
  let prev = 0;
  let raf = 0;
  const frame = (now: number) => {
    const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0;
    prev = now;
    time += dt;
    // 係数を目標へ、ばねで近づける(臨界減衰: a = ω²(目標 - x) - 2ω v)
    const w2 = OMEGA * OMEGA;
    const w2x = 2 * OMEGA;
    for (let n = 0; n < NMAX; n++) {
      bVel[n] += (w2 * (target.b[n] - b[n]) - w2x * bVel[n]) * dt;
      b[n] += bVel[n] * dt;
    }
    dampVel += (w2 * (target.damp - damp) - w2x * dampVel) * dt;
    damp += dampVel * dt;
    travelVel += (w2 * (target.travel - travel) - w2x * travelVel) * dt;
    travel += travelVel * dt;
    phase += SPEED * travel * dt;
    norm = peak(b);
    draw(time);
    raf = requestAnimationFrame(frame);
  };

  const run = () => {
    cancelAnimationFrame(raf);
    prev = 0;
    if (!document.hidden) raf = requestAnimationFrame(frame);
  };
  const onVisibility = () => (document.hidden ? cancelAnimationFrame(raf) : run());

  if (reduceMotion) {
    draw(0);
  } else {
    document.addEventListener("visibilitychange", onVisibility);
    run();
  }
  onLabel(target);

  return {
    setWave(key: string) {
      const next = WAVES[key];
      if (!next || next === target) return;
      target = next;
      onLabel(next);
      if (reduceMotion) {
        b.splice(0, NMAX, ...next.b);
        bVel.fill(0);
        damp = next.damp;
        travel = next.travel;
        norm = peak(b);
        draw(0);
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
