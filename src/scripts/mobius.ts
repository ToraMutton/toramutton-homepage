// ヒーロー背景の 3D: メビウスの帯(ワイヤーフレーム)+ 縁を走る光の粒子 + オービットリング。
//
// 数式メモ
//   メビウスの帯のパラメータ表示(u: 周方向 0〜2π, v: 幅方向 -W〜W)
//     r(u, v) = R + v·cos(u/2)
//     P(u, v) = ( r·cos u,  r·sin u,  v·sin(u/2) )
//   u が 2π 進むと cos(u/2), sin(u/2) の符号が反転するので、P(u+2π, v) = P(u, -v)。
//   つまり「v = W の縁」をそのまま u = 2π を越えて進むと「v = -W の縁」に出て、
//   u = 4π でやっと元の位置に戻る。縁は 1 本の閉曲線で、長さは 2 周ぶん。
//   粒子はこの縁を 0〜4π で走らせるので、上の縁 → 下の縁 → 上の縁…と、
//   表と裏が繋がっていることが見ただけで分かる。
//
// 負荷対策
//   - three はこのファイルごと動的 import され、初期表示の後に読み込まれる
//   - ヒーローが画面外・タブが非表示のときは描画ループを止める
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
  LineDashedMaterial,
  LineSegments,
  NormalBlending,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { THEME_FADE_MS } from "./theme-switch";

export interface MobiusHandle {
  /** true の間は描画ループを止める(三角形がヒーローを覆い切ったときなど) */
  setSuspended(value: boolean): void;
  destroy(): void;
}

// ---- 形のパラメータ ----
const R = 1; // 帯の中心線の半径
const W = 0.42; // 帯の半幅
const TAU = Math.PI * 2;

/** 縁を走る光が、縁をひと回り(0〜4π。表→裏→表)するのにかかる秒数。
 *  年齢を反映して「今年 - 2006」秒(2026 年なら 20 秒、2027 年なら 21 秒)。
 *  読み込み時に 1 回だけ決める(年越しやタイムゾーンは厳密に扱わない) */
const COMET_LAP_SECONDS = new Date().getFullYear() - 2006;

function mobius(u: number, v: number, out: Vector3): Vector3 {
  const r = R + v * Math.cos(u / 2);
  return out.set(r * Math.cos(u), r * Math.sin(u), v * Math.sin(u / 2));
}

/** 曲線 f(t) (t: t0〜t1) を n 本の線分にして positions に積む(LineSegments 用) */
function pushCurve(
  positions: number[],
  f: (t: number, out: Vector3) => Vector3,
  t0: number,
  t1: number,
  n: number,
) {
  const a = new Vector3();
  const b = new Vector3();
  f(t0, a);
  for (let i = 1; i <= n; i++) {
    f(t0 + ((t1 - t0) * i) / n, b);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    a.copy(b);
  }
}

function segments(positions: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  return g;
}

/**
 * 帯のワイヤーフレーム。
 *   周方向(横木): rungs 本。細かく刻んで帯のねじれを滑らかに見せる
 *   幅方向(縦糸): 中心線 + 片側 lanes 本。粗くして軽くする
 * v ≠ 0 の縦糸は 0〜4π で 1 本の閉曲線になる(v と -v が同じ曲線)ので、片側ぶんだけ描けばいい。
 */
function buildBand(rungs: number, lanes: number) {
  const body: number[] = [];
  const edge: number[] = [];
  const steps = rungs * 2;

  // 中心線(v = 0 は 2π で閉じる)
  pushCurve(body, (t, o) => mobius(t, 0, o), 0, TAU, steps);
  // 内側の縦糸
  for (let k = 1; k < lanes; k++) {
    const v = (W * k) / lanes;
    pushCurve(body, (t, o) => mobius(t, v, o), 0, 2 * TAU, steps * 2);
  }
  // 縁(v = W)。少し明るく描くので別ジオメトリにする
  pushCurve(edge, (t, o) => mobius(t, W, o), 0, 2 * TAU, steps * 2);

  // 横木(u 一定で v: -W〜W の直線)
  const a = new Vector3();
  const b = new Vector3();
  for (let j = 0; j < rungs; j++) {
    const u = (TAU * j) / rungs;
    mobius(u, -W, a);
    mobius(u, W, b);
    body.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  return { body: segments(body), edge: segments(edge) };
}

function circle(radius: number, n: number): BufferGeometry {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (TAU * i) / n;
    pts.push(radius * Math.cos(t), radius * Math.sin(t), 0);
  }
  return segments(pts);
}

// ---- 光の粒子(彗星のように尾を引く点の列) ----
const POINT_VERT = /* glsl */ `
  attribute float alpha;
  attribute float size;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uPixelRatio * (6.0 / -mv.z);
    vAlpha = alpha;
  }
`;
const POINT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * a * vAlpha);
  }
`;

/** CSS 変数の色を three の Color と不透明度にする(rgb(… / 0.28) 形式も読む) */
function readColor(name: string): { color: Color; alpha: number } {
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  const nums = value.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255];
  const [r, g, b, a = 1] = nums;
  return { color: new Color(r / 255, g / 255, b / 255), alpha: a };
}

export function mountMobius(container: HTMLElement): MobiusHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    // WebGL が使えない環境では何も出さない(背景がグレーのままになるだけ)
    return null;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = container.clientWidth < 768;
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 50);

  // root: ドラッグと自動回転の対象。帯とリングをまとめて回す
  const root = new Group();
  scene.add(root);

  // ---- 帯 ----
  const band = buildBand(small ? 72 : 128, small ? 3 : 4);
  const bodyMat = new LineBasicMaterial({ transparent: true, depthWrite: false });
  const edgeMat = new LineBasicMaterial({ transparent: true, depthWrite: false });
  root.add(new LineSegments(band.body, bodyMat));
  root.add(new LineSegments(band.edge, edgeMat));

  // ---- オービットリング(土星の輪のように帯を斜めに囲む) ----
  const rings = new Group();
  root.add(rings);
  const ringMat = new LineBasicMaterial({ transparent: true, depthWrite: false });
  const dashMat = new LineDashedMaterial({
    transparent: true,
    depthWrite: false,
    dashSize: 0.05,
    gapSize: 0.07,
  });
  const ringA = new Line(circle(1.85, 256), ringMat);
  ringA.rotation.set(1.2, 0.35, 0);
  const ringB = new Line(circle(2.2, 256), dashMat);
  ringB.computeLineDistances();
  ringB.rotation.set(1.4, -0.55, 0.3);
  const ringC = new Line(circle(1.55, 192), dashMat);
  ringC.computeLineDistances();
  ringC.rotation.set(0.5, 1.1, 0);
  rings.add(ringA, ringB, ringC);

  // ---- 粒子 ----
  // 縁を走る彗星 COMETS 個 + リング A を回る衛星 1 個。どれも TAIL 個の点で尾を引く
  const COMETS = 3;
  const TAIL = 26;
  const heads = COMETS + 1;
  const count = heads * TAIL;
  const pos = new Float32Array(count * 3);
  const alpha = new Float32Array(count);
  const size = new Float32Array(count);
  for (let h = 0; h < heads; h++) {
    for (let i = 0; i < TAIL; i++) {
      const k = h * TAIL + i;
      const f = 1 - i / TAIL; // 先頭ほど 1
      alpha[k] = f * f;
      size[k] = (i === 0 ? 18 : 11) * (0.35 + 0.65 * f);
    }
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
  root.add(points);

  const tmp = new Vector3();
  const ringLocal = new Vector3();
  function updatePoints(time: number) {
    // 縁の彗星: t は 0〜4π を一周する
    for (let h = 0; h < COMETS; h++) {
      const head = (time * 2 * TAU) / COMET_LAP_SECONDS + (2 * TAU * h) / COMETS;
      for (let i = 0; i < TAIL; i++) {
        mobius(head - i * 0.028, W, tmp);
        const k = (h * TAIL + i) * 3;
        pos[k] = tmp.x;
        pos[k + 1] = tmp.y;
        pos[k + 2] = tmp.z;
      }
    }
    // リング A の衛星。リングの回転を掛けて帯と同じ座標系に置く
    const sat = time * 0.3;
    for (let i = 0; i < TAIL; i++) {
      const t = sat - i * 0.02;
      ringLocal.set(1.85 * Math.cos(t), 1.85 * Math.sin(t), 0).applyEuler(ringA.rotation);
      ringLocal.applyEuler(rings.rotation);
      const k = (COMETS * TAIL + i) * 3;
      pos[k] = ringLocal.x;
      pos[k + 1] = ringLocal.y;
      pos[k + 2] = ringLocal.z;
    }
    pointGeo.attributes.position.needsUpdate = true;
  }

  // ---- 色(テーマに追従) ----
  // テーマが変わったら、ページの CSS のフェード(THEME_FADE_MS)と同じ長さで色を補間する
  const fog = new Fog(0x000000, 1, 2);
  scene.fog = fog;

  interface Palette {
    line: Color;
    lineAlpha: number;
    bg: Color;
    glow: Color;
  }
  const readPalette = (): Palette => {
    const line = readColor("--line");
    return {
      line: line.color,
      lineAlpha: line.alpha,
      bg: readColor("--bg").color,
      glow: readColor("--accent-glow").color,
    };
  };
  const setPalette = (p: Palette) => {
    bodyMat.color.copy(p.line);
    bodyMat.opacity = p.lineAlpha;
    edgeMat.color.copy(p.line);
    edgeMat.opacity = Math.min(1, p.lineAlpha * 2.4);
    ringMat.color.copy(p.line);
    ringMat.opacity = p.lineAlpha * 1.2;
    dashMat.color.copy(p.line);
    dashMat.opacity = p.lineAlpha * 0.9;
    pointMat.uniforms.uColor.value.copy(p.glow);
    // 奥ほど背景色に溶ける霧で、線だけでも奥行きが出るようにする(距離は resize で合わせる)
    fog.color.copy(p.bg);
  };
  const setBlending = (dark: boolean) => {
    // 暗い背景では光を足し算して輝かせる。明るい背景で足し算すると白飛びして消えるので普通に重ねる
    pointMat.blending = dark ? AdditiveBlending : NormalBlending;
    pointMat.needsUpdate = true;
  };

  let isDark: boolean | null = null;
  let palette = readPalette();
  let tweenRaf = 0;
  function applyTheme() {
    const dark = document.documentElement.classList.contains("dark");
    // <html> の class は .theme-fading の付け外しでも変わるので、テーマが変わったときだけ動く
    if (dark === isDark) return;
    const first = isDark === null;
    isDark = dark;
    const target = readPalette();

    cancelAnimationFrame(tweenRaf);
    if (first || reduceMotion) {
      palette = target;
      setPalette(palette);
      setBlending(dark);
      return;
    }

    const from = palette;
    const t0 = performance.now();
    let blendSwitched = false;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / THEME_FADE_MS);
      const e = k * k * (3 - 2 * k);
      palette = {
        line: from.line.clone().lerp(target.line, e),
        lineAlpha: from.lineAlpha + (target.lineAlpha - from.lineAlpha) * e,
        bg: from.bg.clone().lerp(target.bg, e),
        glow: from.glow.clone().lerp(target.glow, e),
      };
      setPalette(palette);
      // 光の重ね方は、色がちょうど半分混ざったところで切り替える
      if (!blendSwitched && k >= 0.5) {
        setBlending(dark);
        blendSwitched = true;
      }
      // 描画ループが止まっている(画面外など)ときも、色の変化は反映しておく
      if (!running) render(lastTime);
      if (k < 1) tweenRaf = requestAnimationFrame(step);
    };
    tweenRaf = requestAnimationFrame(step);
  }
  applyTheme();
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  // ---- サイズ ----
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長画面では横幅に収まるよう、カメラを引く
    const dist = camera.aspect < 1 ? 6.8 / Math.max(camera.aspect, 0.55) : 6.8;
    camera.position.set(0, 0, dist);
    // 霧はカメラからの距離で決まるので、カメラを引いたら霧も一緒に遠ざける。
    // 帯の中心(dist)より手前は霧なし、奥側の端に向かって薄くなる
    fog.near = dist - 0.6;
    fog.far = dist + 4.5;
    camera.updateProjectionMatrix();
    // PC ではタイトルが右にあるので、帯を少し左に寄せる
    root.position.x = camera.aspect > 1.1 ? -0.9 : 0;
    root.position.y = camera.aspect > 1.1 ? 0 : 0.35;
  }
  const resizeObserver = new ResizeObserver(() => {
    resize();
    // 大きさを変えると canvas は消えるので、動いている最中でもすぐ描き直す(空白のコマが点滅して見える)
    render(lastTime);
  });
  resizeObserver.observe(container);
  resize();

  // ---- 回転(自動回転 + 慣性付きドラッグ) ----
  root.rotation.set(-0.35, 0.3, 0.2); // 帯のねじれがよく見える初期姿勢
  const AUTO = reduceMotion ? 0 : 0.1; // rad/s
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
    if (!running) render(lastTime);
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
  let lastTime = 0; // 粒子の位置を決める経過時間(秒)
  let prev = 0;
  function render(time: number) {
    updatePoints(time);
    renderer.render(scene, camera);
  }
  function frame(now: number) {
    const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0;
    prev = now;
    if (!reduceMotion) lastTime += dt;

    if (!dragging) {
      // 慣性は指数関数的に減衰させる(dt に依らず同じ減り方になる)
      const decay = Math.exp(-dt * 2.2);
      vel.x *= decay;
      vel.y *= decay;
      root.rotateOnWorldAxis(axisY, (vel.y + AUTO) * dt);
      root.rotateOnWorldAxis(axisX, vel.x * dt);
    }
    // リングだけはゆっくり歳差運動させて、帯との重なり方を変化させる
    rings.rotation.z += dt * (reduceMotion ? 0 : 0.05);
    render(lastTime);
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

  render(0);
  sync();
  // 最初のフレームを描いてからフェードインさせる
  requestAnimationFrame(() => container.classList.add("is-ready"));

  return {
    setSuspended(value: boolean) {
      suspended = value;
      sync();
    },
    destroy() {
      renderer.setAnimationLoop(null);
      cancelAnimationFrame(tweenRaf);
      io.disconnect();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      scene.traverse((obj) => {
        const o = obj as { geometry?: BufferGeometry };
        o.geometry?.dispose();
      });
      [bodyMat, edgeMat, ringMat, dashMat, pointMat].forEach((m) => m.dispose());
      renderer.dispose();
      el.remove();
    },
  };
}
