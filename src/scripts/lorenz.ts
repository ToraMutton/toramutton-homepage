// /about ヒーローの 3D: ローレンツアトラクタ(ライン描画)+ その上を走る光の粒子。
//
// 数式メモ
//   ローレンツ方程式(大気の対流を 3 本の式まで切り詰めたモデル)
//     dx/dt = σ(y − x)
//     dy/dt = x(ρ − z) − y
//     dz/dt = xy − βz        σ = 10, ρ = 28, β = 8/3
//   この組み合わせだと軌道は決して閉じず、同じ道を 2 度通らないまま、
//   蝶の羽のような 2 つの渦(x ≈ ±8.5, z = ρ − 1 = 27 のあたり)を行ったり来たりする。
//   初期値がほんの少し違うだけで、そのうち全く別の軌道になる(カオス)。
//
// 作り方(軽くするための工夫)
//   - 線: 起動時に 1 回だけ数値積分(RK4)して、数千点の折れ線に固定する。毎フレームの計算はゼロ
//     (初期値の影響が消えるまでの捨て区間 TRANSIENT_STEPS は、渦が左右ほぼ同じ回数になるものを選んである)
//   - 光の粒: 彗星 COMETS 個が、その折れ線の上を「何番目の点か」で進むだけ。座標は隣り合う 2 点の補間。
//     軌道の両端では透明になって現れ・消えるので、継ぎ目は見えない
//     (粒ごとに別々に積分すると、カオスのせいで線とは別の軌道を走り、線の外へはみ出して見える)
//
// 負荷対策(mobius.ts と同じ)
//   - three はこのファイルごと動的 import され、初期表示の後に読み込まれる
//   - 画面外・タブが非表示・三角形が覆い切ったときは描画ループを止める
//   - prefers-reduced-motion のときは自動回転と粒子の移動を止める(ドラッグは可能)

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Fog,
  Group,
  Line,
  LineBasicMaterial,
  NormalBlending,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { POINT_FRAG, POINT_VERT, readColor, trackTheme } from "./scene-utils";

export const SIGMA = 10;
export const RHO = 28;
export const BETA = 8 / 3;

type State = [x: number, y: number, z: number];

/** 方程式の右辺 */
function deriv([x, y, z]: State): State {
  return [SIGMA * (y - x), x * (RHO - z) - y, x * y - BETA * z];
}

/** 4 次のルンゲ・クッタ法で 1 ステップ(h)進める */
function rk4(s: State, h: number): State {
  const add = (a: State, b: State, k: number): State => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const k1 = deriv(s);
  const k2 = deriv(add(s, k1, h / 2));
  const k3 = deriv(add(s, k2, h / 2));
  const k4 = deriv(add(s, k3, h));
  return [
    s[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    s[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    s[2] + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
  ];
}

// ---- 形のパラメータ ----
/** 方程式の座標 → シーンの座標の倍率 */
const SCALE = 0.085;
/** アトラクタは z ≈ 0〜50 に広がる。真ん中(≈ 25)を原点に合わせて回転の中心にする */
const Z_CENTER = 25;
/** 積分の刻み(方程式上の時間) */
const STEP_H = 0.005;
/** 最初に捨てるステップ数。初期値の影響を消し、アトラクタに乗せる。左右の渦が同じ回数になる値(実測で選んだ) */
const TRANSIENT_STEPS = 4400;
/** 線にする軌道の点の数(STEP_H × 点数 = 方程式上の長さ 10。渦は左 6 周・右 7 周) */
const TRAJ_POINTS = 2000;
/** 線にした軌道に含まれる渦の数(左 6 周 + 右 7 周。TRANSIENT_STEPS・TRAJ_POINTS を変えたら数え直すこと) */
const LOOP_COUNT = 13;
/** 光の粒が渦を 1 周するのにかける秒数 = (今年 − 2006) / 10。
 *  トップのメビウスの縁を走る光(mobius.ts)と同じく年齢に連動する(2026 年なら 2.0 秒、2030 年なら 2.4 秒)。
 *  メビウスは (今年 − 2006) 秒で縁を 1 周するが、こちらは渦 1 周なので 10 分の 1 にしてある。
 *  読み込み時に 1 回だけ決める(年越しやタイムゾーンは厳密に扱わない) */
const LOOP_SECONDS = (new Date().getFullYear() - 2006) / 10;
/** 光の粒が線の上を進む速さ(点 / 秒)。渦 1 周ぶんの点の数 ÷ 1 周の秒数 */
const COMET_SPEED = TRAJ_POINTS / LOOP_COUNT / LOOP_SECONDS;
/** 彗星の数と、尾の点の数。尾の点どうしの間隔は TAIL_GAP 点ぶん */
const COMETS = 3;
const TAIL = 48;
const TAIL_GAP = 2;
/** 線の両端で、粒が現れる・消えるまでの長さ(点の数) */
const FADE = 120;

export interface LorenzHandle {
  /** true の間は描画ループを止める(三角形がヒーローを覆い切ったときなど) */
  setSuspended(value: boolean): void;
  destroy(): void;
}

export interface LorenzOptions {
  /** 先頭の彗星の位置(方程式の座標)を 1 秒に約 10 回知らせる。HUD の数字用 */
  onSample?: (x: number, y: number, z: number) => void;
}

/** 起動時に積分して、線にする軌道を作る */
function buildTrajectory(): Float32Array {
  let s: State = [0.1, 0, 0];
  // 初期値の影響が消えて、アトラクタに乗るまで捨てる
  for (let i = 0; i < TRANSIENT_STEPS; i++) s = rk4(s, STEP_H);
  const pts = new Float32Array(TRAJ_POINTS * 3);
  for (let i = 0; i < TRAJ_POINTS; i++) {
    s = rk4(s, STEP_H);
    pts[i * 3] = s[0] * SCALE;
    pts[i * 3 + 1] = s[1] * SCALE;
    pts[i * 3 + 2] = (s[2] - Z_CENTER) * SCALE;
  }
  return pts;
}

export function mountLorenz(container: HTMLElement, options: LorenzOptions = {}): LorenzHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    // WebGL が使えない環境では何も出さない(背景がそのままになるだけ)
    return null;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 60);

  // root: ドラッグと自動回転の対象。pivot: 方程式の z 軸を画面の上向きに立てる(蝶が正面から見える向き)
  const root = new Group();
  const pivot = new Group();
  pivot.rotation.x = -Math.PI / 2;
  root.add(pivot);
  scene.add(root);

  // ---- 線 ----
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute("position", new BufferAttribute(buildTrajectory(), 3));
  const lineMat = new LineBasicMaterial({ transparent: true, depthWrite: false });
  pivot.add(new Line(lineGeo, lineMat));

  // ---- 光の粒子 ----
  // 彗星ごとに「先頭がいま線の何番目の点にいるか」(head)を持つ。尾の k 番目は head − k × TAIL_GAP 番目
  const traj = lineGeo.attributes.position.array as Float32Array;
  const count = COMETS * TAIL;
  const pos = new Float32Array(count * 3);
  const alpha = new Float32Array(count);
  const size = new Float32Array(count);
  const tailAlpha = new Float32Array(TAIL); // 尾の先ほど透明(線の端での出入りは、これに別途掛ける)
  for (let i = 0; i < TAIL; i++) {
    const f = 1 - i / TAIL; // 先頭ほど 1
    tailAlpha[i] = f * f;
    for (let h = 0; h < COMETS; h++) size[h * TAIL + i] = (i === 0 ? 26 : 16) * (0.35 + 0.65 * f);
  }
  const pointGeo = new BufferGeometry();
  pointGeo.setAttribute("position", new BufferAttribute(pos, 3));
  pointGeo.setAttribute("alpha", new BufferAttribute(alpha, 1));
  pointGeo.setAttribute("size", new BufferAttribute(size, 1));
  const pointMat = new ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    uniforms: { uColor: { value: new Color() }, uPixelRatio: { value: pixelRatio } },
    transparent: true,
    depthWrite: false,
  });
  const points = new Points(pointGeo, pointMat);
  points.frustumCulled = false;
  pivot.add(points);

  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  /** 先頭が (線の端から端までの長さ + 尾の長さ) を 1 周する。尾が出切ってから、また始まる */
  const CYCLE = TRAJ_POINTS + TAIL * TAIL_GAP;
  // 3 つを等間隔に並べ、最初は線の中ほど(粒が見える位置)から始める
  const heads = Array.from({ length: COMETS }, (_, h) => (0.2 + h * 0.3) * CYCLE);

  function place(dt: number) {
    for (let h = 0; h < COMETS; h++) {
      heads[h] = (heads[h] + dt * COMET_SPEED) % CYCLE;
      for (let i = 0; i < TAIL; i++) {
        const idx = heads[h] - i * TAIL_GAP;
        // 線の上の位置: 隣り合う 2 点の間を補間(線の外に出たら端の点に留める)
        const c = Math.min(TRAJ_POINTS - 1.001, Math.max(0, idx));
        const j = Math.floor(c);
        const f = c - j;
        const k = (h * TAIL + i) * 3;
        for (let a = 0; a < 3; a++) pos[k + a] = traj[j * 3 + a] * (1 - f) + traj[(j + 1) * 3 + a] * f;
        // 線の両端では透明にして、現れる・消えるときに跳ばないようにする
        alpha[h * TAIL + i] = tailAlpha[i] * smooth(0, FADE, idx) * smooth(TRAJ_POINTS - 1, TRAJ_POINTS - 1 - FADE, idx);
      }
    }
    pointGeo.attributes.position.needsUpdate = true;
    pointGeo.attributes.alpha.needsUpdate = true;
  }
  place(0);

  /** 先頭の彗星の位置(方程式の座標に戻したもの)。HUD の数字用 */
  const headXYZ = (): State => [pos[0] / SCALE, pos[1] / SCALE, pos[2] / SCALE + Z_CENTER];

  // ---- 色(テーマに追従) ----
  const fog = new Fog(0x000000, 1, 2);
  scene.fog = fog;

  interface Palette {
    line: Color;
    lineAlpha: number;
    bg: Color;
    glow: Color;
  }
  const stopTheme = trackTheme<Palette>({
    reduceMotion,
    read: () => {
      const line = readColor("--line");
      return {
        line: line.color,
        lineAlpha: line.alpha,
        bg: readColor("--bg").color,
        glow: readColor("--accent-glow").color,
      };
    },
    lerp: (a, b, e) => ({
      line: a.line.clone().lerp(b.line, e),
      lineAlpha: a.lineAlpha + (b.lineAlpha - a.lineAlpha) * e,
      bg: a.bg.clone().lerp(b.bg, e),
      glow: a.glow.clone().lerp(b.glow, e),
    }),
    apply: (p) => {
      lineMat.color.copy(p.line);
      // 線は細く重なりが多いので、帯(メビウス)より少し濃く描いて存在感を出す
      lineMat.opacity = Math.min(1, p.lineAlpha * 1.5);
      pointMat.uniforms.uColor.value.copy(p.glow);
      // 奥ほど背景色に溶ける霧で、線だけでも奥行きが出るようにする
      fog.color.copy(p.bg);
    },
    setBlend: (dark) => {
      // 暗い背景では光を足し算して輝かせる。明るい背景で足し算すると白飛びして消えるので普通に重ねる
      pointMat.blending = dark ? AdditiveBlending : NormalBlending;
      pointMat.needsUpdate = true;
    },
    redraw: () => {
      if (!running) render();
    },
  });

  // ---- サイズ ----
  /** アトラクタの高さ(シーン上で約 3.0。z ≈ 8〜43 × SCALE)が、画面の高さに対してこの割合になるようカメラを引く。
   実際の見た目は、手前に来る部分が大きく見えるぶん、これより 1 割ほど大きくなる */
  const FILL = 0.5;
  const HALF_TAN = Math.tan((35 / 2) * (Math.PI / 180));
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 横長: 高さに合わせる。縦長: 回したときの横幅(約 4.4)に収まるよう、もっと引く
    const forHeight = 3.0 / FILL / (2 * HALF_TAN);
    const forWidth = 4.4 / (2 * HALF_TAN * Math.min(camera.aspect, 1));
    const dist = Math.max(forHeight, camera.aspect < 1 ? forWidth : 0);
    camera.position.set(0, 0, dist);
    // 霧はカメラからの距離で決まる。アトラクタの中心(dist)より手前は霧なし、奥に向かって薄くなる
    fog.near = dist - 2.5;
    fog.far = dist + 5.5;
    camera.updateProjectionMatrix();
    // PC では左にタイトルとターミナルがあるので、アトラクタを右へ寄せる(見える幅の 19%)。
    // 右上の HUD と重ならないよう、少し下げる(見える高さの 5%)
    const visibleHeight = 2 * HALF_TAN * dist;
    const visibleWidth = visibleHeight * camera.aspect;
    root.position.x = camera.aspect > 1.1 ? visibleWidth * 0.19 : 0;
    root.position.y = camera.aspect > 1.1 ? -visibleHeight * 0.05 : 0.6;
  }
  const resizeObserver = new ResizeObserver(() => {
    resize();
    // 大きさを変えると canvas は消えるので、動いている最中でもすぐ描き直す(空白のコマが点滅して見える)
    render();
  });
  resizeObserver.observe(container);
  resize();

  // ---- 回転(自動回転 + 慣性付きドラッグ) ----
  root.rotation.set(0.12, 0.25, 0); // 2 つの渦がほぼ正面から、少しだけ奥行きをもって見える初期姿勢
  const AUTO = reduceMotion ? 0 : 0.12; // rad/s
  const vel = { x: 0, y: 0 }; // ドラッグで与えた角速度
  const axisX = new Vector3(1, 0, 0);
  const axisY = new Vector3(0, 1, 0);
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastMove = 0;

  const el = renderer.domElement;
  el.style.cursor = "grab";
  // 縦方向のスワイプはページのスクロールに譲る(スクロールを奪わない)
  el.style.touchAction = "pan-y";

  function onDown(e: PointerEvent) {
    // 指では回さない(縦スクロールと被るため)。自動回転はそのまま、マウスやペンは回せる
    if (e.pointerType === "touch") return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    lastMove = performance.now();
    vel.x = vel.y = 0;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  }
  function onMove(e: PointerEvent) {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastMove) / 1000;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const k = 0.006;
    root.rotateOnWorldAxis(axisY, dx * k);
    root.rotateOnWorldAxis(axisX, dy * k);
    // 指を離した後も同じ速さで回り続けるよう、直近の角速度を覚える
    vel.y = (dx * k) / dt;
    vel.x = (dy * k) / dt;
    lastX = e.clientX;
    lastY = e.clientY;
    lastMove = now;
    if (!running) render();
  }
  function onUp(e: PointerEvent) {
    dragging = false;
    el.style.cursor = "grab";
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    // しばらく止まってから離した場合は慣性を付けない
    if (performance.now() - lastMove > 80) vel.x = vel.y = 0;
  }
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);

  // ---- 描画ループ ----
  let prev = 0;
  let sampleAt = 0;
  function render() {
    renderer.render(scene, camera);
  }
  function frame(now: number) {
    const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0;
    prev = now;

    if (!reduceMotion) place(dt);

    if (!dragging) {
      // 慣性は指数関数的に減衰させる(dt に依らず同じ減り方になる)
      const decay = Math.exp(-dt * 2.2);
      vel.x *= decay;
      vel.y *= decay;
      root.rotateOnWorldAxis(axisY, (vel.y + AUTO) * dt);
      root.rotateOnWorldAxis(axisX, vel.x * dt);
    }

    if (options.onSample && now - sampleAt > 100) {
      sampleAt = now;
      const [x, y, z] = headXYZ();
      options.onSample(x, y, z);
    }
    render();
  }

  // ヒーローが見えていて、タブも表示中のときだけループを回す
  let running = false;
  let visible = true;
  let suspended = false;
  function sync() {
    const shouldRun = visible && !suspended && !document.hidden;
    if (shouldRun === running) return;
    running = shouldRun;
    prev = 0;
    renderer.setAnimationLoop(running ? frame : null);
  }
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  io.observe(container);
  document.addEventListener("visibilitychange", sync);

  render();
  sync();
  const [sx, sy, sz] = headXYZ();
  options.onSample?.(sx, sy, sz);
  // 最初のフレームを描いてからフェードインさせる
  requestAnimationFrame(() => container.classList.add("is-ready"));

  return {
    setSuspended(value: boolean) {
      suspended = value;
      sync();
    },
    destroy() {
      renderer.setAnimationLoop(null);
      stopTheme();
      io.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      lineGeo.dispose();
      pointGeo.dispose();
      lineMat.dispose();
      pointMat.dispose();
      renderer.dispose();
      el.remove();
    },
  };
}
