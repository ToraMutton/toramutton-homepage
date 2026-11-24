// /about の Bento Grid に置く、ワイヤーフレームのレトロ CRT モニター(Three.js)。
// 顔の絵は crt-face.ts、置き場所とまわりの飾り(オリオン座・LED)は components/about/bento/BentoCrt.astro。
//
// ---- つくり ----
//   モニター … 角丸のベゼル(ExtrudeGeometry の輪郭)+ 背面のブラウン管(四角錐 → 首 → 丸い「お尻」)を、
//              線(LineSegments)だけで組んだプロシージャル。前面のベゼルだけは背景色で塗って、
//              手前の面が奥の線を隠す(隠線処理)。すると正面は「物」に見え、斜めから見ると裏の骨組みが透ける。
//   画面     … 80×60 の canvas(ドット絵の顔)を NearestFilter で貼った板。シェーダで色づけ・走査線・樽型のゆがみ・
//              グリッチ・電源オフの「ビュン」まで 1 枚でやる(ShaderMaterial)。
//   リング   … モニターの足元に斜めに浮かぶ白いリングと、その一部に重なるシアンの円弧。
//
// ---- 操作 ----
//   canvas は pointer-events: none(はみ出した透明な部分が、まわりのカードの操作を邪魔しないため)。
//   ポインターは window で受け取り、カメラ越しの Raycaster で「モニターに乗っているか」を自分で判定する。
//   通常   … カーソルのほうへ首をかしげ(ばね)、目もカーソルを追う。ときどきまばたき
//   hover  … 走査線のグリッチが一瞬走り、^ ^ の顔になって、モニターが手前に寄る
//   click  … > < の顔 + ばねの反動で「ボヨンッ」
//   5 連打 … x x → カーネルパニック風の文字 → 電源が落ちて再起動
//   放置   … sleepAfter 秒だけ何もしないと ( ˘ω˘ ) zzz でスリープ(輝度が落ちる)。hover / click で復帰
//             残り時間は LED(onLevel)に伝える。?crt-sleep=秒 で秒数を上書きできる(確認用)
//
// ---- 負荷対策(lorenz.ts と同じ) ----
//   見えているとき・タブが表示中のときだけループを回す(放置タイマーもそのあいだだけ進む)。pixelRatio は 2 まで。
//   顔の canvas は、表情・目の位置・まばたきが変わったときだけ描き直す。prefers-reduced-motion では揺れ・グリッチを弱める。

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  EdgesGeometry,
  ExtrudeGeometry,
  Fog,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Shape,
  ShaderMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { drawFace, FACE_H, FACE_W, PANIC_TOTAL, type Expression, type FaceState } from "./crt-face";
import { readColor, trackTheme } from "./scene-utils";

/** LED の本数 */
export const LED_COUNT = 8;
/** 何も操作しないでスリープに入るまでの秒数 */
const SLEEP_AFTER = 24;
/** 5 回押すまでの制限時間(ミリ秒) */
const PANIC_WINDOW_MS = 2200;

export type CrtState = "online" | "sleep" | "panic";

export interface CrtOptions {
  /** スリープまでの秒数(省略すると SLEEP_AFTER。URL の ?crt-sleep= が最優先) */
  sleepAfter?: number;
  /** LED の点灯数(0〜LED_COUNT)が変わったとき。上から順に消えていく */
  onLevel?: (lit: number) => void;
  /** 状態(起きている・スリープ・パニック中)が変わったとき */
  onState?: (state: CrtState) => void;
}

export interface CrtHandle {
  destroy(): void;
}

// ---- 形(単位は適当。ベゼルの幅 2.56) ----
const BEZEL_W = 2.56;
const BEZEL_H = 2.16;
const BEZEL_D = 0.46; // ベゼルの奥行き。背面側が z = 0、画面のある前面が z = BEZEL_D
const TUBE_Z = -1.3; // 四角錐の終わり
const NECK_Z = -1.85; // 首の終わり
const NECK_R = 0.3;
const TIP_Z = NECK_Z - NECK_R; // お尻の先
/** モニター全体の奥行きの真ん中。これが回転の中心(原点)に来るようにずらす */
const MID_Z = (BEZEL_D + TIP_Z) / 2;

/** カメラに収めたい範囲(ワールドの y と横幅の半分)。ベゼルの上端からリングの下端まで */
const CONTENT_TOP = 1.2;
const CONTENT_BOTTOM = -2.0;
const CONTENT_HALF_W = 1.95;
/** 範囲を、canvas に収まる最大の大きさに対してこの割合まで縮める(手前に出ているぶんが大きく見えるので、余裕をとる) */
const FIT = 0.8;
/** 範囲の中心を置く位置(canvas の幅・高さに対する割合)。左のオリオン座・右の LED を避けて、少し右へ。
 *  狭い幅(スマホ)では、右上の状態表示(ONLINE)を隠さないよう真ん中に */
const CENTER_X = 0.55;
const CENTER_X_NARROW = 0.5;
const NARROW_PX = 520;
const CENTER_Y = 0.515;

const FOV = 30;
const HALF_TAN = Math.tan((FOV / 2) * (Math.PI / 180));

// 画面の色(画面は自分で光るので、テーマに関わらず固定)
const SCREEN_BG = [0.03, 0.05, 0.06];
const SCREEN_FG = [0.56, 0.84, 0.88];

type V3 = [number, number, number];

function roundedRectShape(w: number, h: number, r: number): Shape {
  const x = -w / 2;
  const y = -h / 2;
  const s = new Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** 線分の集まり。1 つの BufferGeometry にまとめて、1 回の描画で済ませる */
class Segments {
  private readonly p: number[] = [];
  line(a: V3, b: V3) {
    this.p.push(...a, ...b);
  }
  loop(pts: V3[]) {
    for (let i = 0; i < pts.length; i++) this.line(pts[i], pts[(i + 1) % pts.length]);
  }
  strip(pts: V3[]) {
    for (let i = 0; i < pts.length - 1; i++) this.line(pts[i], pts[i + 1]);
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(this.p), 3));
    return g;
  }
}

const rect = (w: number, h: number, z: number): V3[] => [
  [-w / 2, -h / 2, z],
  [w / 2, -h / 2, z],
  [w / 2, h / 2, z],
  [-w / 2, h / 2, z],
];
const circle = (r: number, z: number, n: number): V3[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r, z];
  });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 背面のブラウン管: 四角錐 → 首(円筒)→ 丸いお尻 */
function buildTube(): BufferGeometry {
  const s = new Segments();
  const FW = 2.0;
  const FH = 1.66;
  const BW = 0.8;
  const BH = 0.66;
  // 四角錐: 断面の枠を 4 つと、角の 4 本
  for (const t of [0, 1 / 3, 2 / 3, 1]) s.loop(rect(lerp(FW, BW, t), lerp(FH, BH, t), lerp(0, TUBE_Z, t)));
  const front = rect(FW, FH, 0);
  const back = rect(BW, BH, TUBE_Z);
  for (let i = 0; i < 4; i++) s.line(front[i], back[i]);

  // 首: 円の輪と縦線。四角錐の角から、円の 45° / 135° / … の点へつなぐ
  const N = 16;
  for (const z of [TUBE_Z, TUBE_Z + (NECK_Z - TUBE_Z) * 0.33, TUBE_Z + (NECK_Z - TUBE_Z) * 0.66, NECK_Z]) {
    s.loop(circle(NECK_R, z, N));
  }
  const ringA = circle(NECK_R, TUBE_Z, N);
  const ringB = circle(NECK_R, NECK_Z, N);
  for (let i = 0; i < N; i += 2) s.line(ringA[i], ringB[i]);
  // 四角錐の角 [-,-] [+,-] [+,+] [-,+] ↔ 円の 225° 315° 45° 135°(N=16 なので 22.5° ずつ)
  [10, 14, 2, 6].forEach((idx, i) => s.line(back[i], ringA[idx]));

  // お尻: 半球を、緯線 2 本と経線 8 本の骨組みで
  const capAngles = [0, 30, 60, 90].map((d) => (d * Math.PI) / 180);
  for (const a of capAngles.slice(1, 3)) s.loop(circle(NECK_R * Math.cos(a), NECK_Z - NECK_R * Math.sin(a), N));
  for (let i = 0; i < N; i += 2) {
    const a0 = (i / N) * Math.PI * 2;
    s.strip(
      capAngles.map((a): V3 => [Math.cos(a0) * NECK_R * Math.cos(a), Math.sin(a0) * NECK_R * Math.cos(a), NECK_Z - NECK_R * Math.sin(a)])
    );
  }
  return s.geometry();
}

/** 画面の板に貼るシェーダ */
const SCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SCREEN_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uTexel;
  uniform float uTime;
  uniform float uGlitch;   // 0〜1: 走査線のずれ・色ずれ・ノイズ
  uniform float uBright;   // 0〜1: 輝度(スリープで落ちる)
  uniform float uPower;    // 0〜1: 電源(0 に向かって縦に潰れて 1 本の線になる)
  uniform vec3 uBg;
  uniform vec3 uFg;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    float pw = clamp(uPower, 0.0, 1.0);
    vec2 uv = vUv;

    // 電源オフ: 縦に潰れていく
    uv.y = (uv.y - 0.5) / max(pw * pw, 0.004) + 0.5;

    // ブラウン管の丸み(樽型のゆがみ)
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);
    c *= 1.0 + 0.1 * r2;
    uv = c + 0.5;

    // グリッチ: 横長の帯がときどきずれる
    float band = floor(uv.y * 18.0);
    float tick = floor(uTime * 24.0);
    float on = step(1.0 - 0.45 * uGlitch, hash(vec2(band, tick)));
    uv.x += on * (hash(vec2(band + 7.0, tick)) - 0.5) * 0.22 * uGlitch;

    // 色ずれ(赤と青を左右にずらして重ねる)
    float sp = 0.012 * uGlitch;
    vec3 lum = vec3(
      texture2D(uMap, uv + vec2(sp, 0.0)).r,
      texture2D(uMap, uv).r,
      texture2D(uMap, uv - vec2(sp, 0.0)).r
    );

    // 光のにじみ(テクスチャが Nearest なので、ブロック状ににじむ)
    float glow = texture2D(uMap, uv + vec2(uTexel.x * 1.5, 0.0)).r + texture2D(uMap, uv - vec2(uTexel.x * 1.5, 0.0)).r
               + texture2D(uMap, uv + vec2(0.0, uTexel.y * 1.5)).r + texture2D(uMap, uv - vec2(0.0, uTexel.y * 1.5)).r;
    lum += glow * 0.07;

    vec3 col = uBg + (uFg - uBg) * lum;

    // 走査線(ドットの 1 行ごとに 1 本)
    float scan = 0.5 - 0.5 * cos(vUv.y * ${FACE_H.toFixed(1)} * 6.28318);
    col *= 0.8 + 0.2 * scan;

    // ざらつきとちらつき
    float n = hash(uv * vec2(${FACE_W.toFixed(1)}, ${FACE_H.toFixed(1)}) + uTime);
    col += (n - 0.5) * (0.04 + 0.3 * uGlitch);
    col *= 0.97 + 0.03 * sin(uTime * 55.0);

    // 四隅を暗く、丸い角の外は黒く
    col *= clamp(1.0 - 1.5 * r2, 0.0, 1.0);
    vec2 q = abs(uv - 0.5);
    col *= step(max(q.x, q.y), 0.5);

    // 電源を落とす途中の、1 本の光る線
    float line = smoothstep(0.014, 0.0, abs(vUv.y - 0.5)) * (1.0 - pw) * smoothstep(0.0, 0.2, pw + 0.12);
    col += uFg * line * 0.9;

    gl_FragColor = vec4(col * uBright, 1.0);
  }
`;

/** ばね。k が硬さ、c が減衰(小さいほど長く揺れる)。x が現在値、t が目標、v が速さ */
class Spring {
  x = 0;
  v = 0;
  t = 0;
  constructor(
    private readonly k: number,
    private readonly c: number
  ) {}
  step(dt: number) {
    // 細かく刻んで安定させる(重いフレームでも発散しない)
    const n = Math.max(1, Math.ceil(dt * 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.k * (this.t - this.x) - this.c * this.v) * h;
      this.x += this.v * h;
    }
  }
}

export function mountCrt(stage: HTMLElement, options: CrtOptions = {}): CrtHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return null;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  stage.appendChild(renderer.domElement);
  const el = renderer.domElement;
  el.style.display = "block";
  el.style.width = "100%";
  el.style.height = "100%";

  const urlSleep = Number(new URLSearchParams(location.search).get("crt-sleep"));
  const sleepAfter = urlSleep > 0 ? urlSleep : (options.sleepAfter ?? SLEEP_AFTER);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 50);
  const fog = new Fog(0x000000, 1, 2);
  scene.fog = fog;

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  // rig: 首かしげ・手前に寄る・ボヨンを受け持つ。model: 奥行きの真ん中を原点に合わせる
  const root = new Group();
  const rig = new Group();
  rig.rotation.order = "YXZ";
  const model = new Group();
  model.position.z = -MID_Z;
  rig.add(model);
  root.add(rig);
  scene.add(root);

  // ---- 材質(色はテーマに追従) ----
  const lineMat = track(new LineBasicMaterial({ transparent: true, depthWrite: false }));
  const backMat = track(new LineBasicMaterial({ transparent: true, depthWrite: false }));
  const fillMat = track(
    new MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  );

  // ---- ベゼル: 塗りつぶし(隠線処理用)+ 輪郭 ----
  const bezelGeo = track(
    new ExtrudeGeometry(roundedRectShape(BEZEL_W, BEZEL_H, 0.24), { depth: BEZEL_D, bevelEnabled: false, curveSegments: 8 })
  );
  model.add(new Mesh(bezelGeo, fillMat));
  const bezelEdges = track(new EdgesGeometry(bezelGeo, 30));
  model.add(new LineSegments(bezelEdges, lineMat));

  // 前面の飾り: ベゼルの内側の枠、画面の縁
  const loopOf = (shape: Shape, z: number) => {
    const pts = shape.getPoints(8).map((p) => new Vector3(p.x, p.y, z));
    return new LineLoop(track(new BufferGeometry().setFromPoints(pts)), lineMat);
  };
  model.add(loopOf(roundedRectShape(2.34, 1.9, 0.16), BEZEL_D + 0.002));
  model.add(loopOf(roundedRectShape(1.98, 1.5, 0.1), BEZEL_D + 0.004));

  // 下の帯: フロッピーのスリット・つまみ 2 つ・電源ランプ
  const front = new Segments();
  front.line([-0.95, -0.9, BEZEL_D + 0.002], [-0.35, -0.9, BEZEL_D + 0.002]);
  front.loop(circle(0.07, BEZEL_D + 0.002, 12).map(([x, y, z]): V3 => [x + 0.62, y - 0.9, z]));
  front.loop(circle(0.07, BEZEL_D + 0.002, 12).map(([x, y, z]): V3 => [x + 0.84, y - 0.9, z]));
  model.add(new LineSegments(track(front.geometry()), lineMat));
  const ledMat = track(new MeshBasicMaterial({ transparent: true }));
  const led = new Mesh(track(new PlaneGeometry(0.075, 0.075)), ledMat);
  led.position.set(1.05, -0.9, BEZEL_D + 0.003);
  model.add(led);

  // ---- 背面のブラウン管(奥の線は少し薄く) ----
  model.add(new LineSegments(track(buildTube()), backMat));

  // ---- 画面 ----
  const canvas = document.createElement("canvas");
  canvas.width = FACE_W;
  canvas.height = FACE_H;
  const ctx = canvas.getContext("2d")!;
  const texture = track(new CanvasTexture(canvas));
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  const screenMat = track(
    new ShaderMaterial({
      vertexShader: SCREEN_VERT,
      fragmentShader: SCREEN_FRAG,
      uniforms: {
        uMap: { value: texture },
        uTexel: { value: new Vector2(1 / FACE_W, 1 / FACE_H) },
        uTime: { value: 0 },
        uGlitch: { value: 0 },
        uBright: { value: 1 },
        uPower: { value: 1 },
        uBg: { value: new Color(SCREEN_BG[0], SCREEN_BG[1], SCREEN_BG[2]) },
        uFg: { value: new Color(SCREEN_FG[0], SCREEN_FG[1], SCREEN_FG[2]) },
      },
    })
  );
  const screen = new Mesh(track(new PlaneGeometry(1.92, 1.44)), screenMat);
  screen.position.z = BEZEL_D + 0.006;
  model.add(screen);

  // ---- 当たり判定用の見えない箱(Raycaster でここに当たったら「モニターに乗っている」) ----
  const hitMesh = new Mesh(track(new BoxGeometry(BEZEL_W + 0.1, BEZEL_H + 0.1, BEZEL_D - TIP_Z)), new MeshBasicMaterial({ visible: false }));
  hitMesh.position.z = (BEZEL_D + TIP_Z) / 2;
  model.add(hitMesh);

  // ---- 足元のリング: 斜めに傾いた白いリングと、その一部に重なるシアンの円弧 ----
  const RING_R = 1.5;
  const ringTilt = new Group();
  ringTilt.position.set(0, -1.38, -0.15);
  ringTilt.rotation.set(0.2, 0, -0.2);
  const ringFlat = new Group();
  ringFlat.rotation.x = Math.PI / 2;
  const ringMat = track(new MeshBasicMaterial({ fog: false }));
  const arcMat = track(new MeshBasicMaterial({ fog: false }));
  ringFlat.add(new Mesh(track(new TorusGeometry(RING_R, 0.02, 8, 128)), ringMat));
  const arcSpin = new Group();
  arcSpin.add(new Mesh(track(new TorusGeometry(RING_R, 0.04, 8, 48, Math.PI * 0.45)), arcMat));
  ringFlat.add(arcSpin);
  ringTilt.add(ringFlat);
  root.add(ringTilt);

  // テーマから決まる線の濃さ。眠ると暗くするので、ここに控えておく
  let lineBase = 1;
  let backBase = 1;

  // ---- 色(テーマに追従) ----
  interface Palette {
    line: Color;
    lineAlpha: number;
    fill: Color;
    text: Color;
    accent: Color;
  }
  const stopTheme = trackTheme<Palette>({
    reduceMotion,
    read: () => {
      const line = readColor("--line");
      return {
        line: line.color,
        lineAlpha: line.alpha,
        fill: readColor("--bg").color,
        text: readColor("--text").color,
        accent: readColor("--accent").color,
      };
    },
    lerp: (a, b, e) => ({
      line: a.line.clone().lerp(b.line, e),
      lineAlpha: a.lineAlpha + (b.lineAlpha - a.lineAlpha) * e,
      fill: a.fill.clone().lerp(b.fill, e),
      text: a.text.clone().lerp(b.text, e),
      accent: a.accent.clone().lerp(b.accent, e),
    }),
    apply: (p) => {
      lineMat.color.copy(p.line);
      lineBase = Math.min(1, p.lineAlpha * 2);
      lineMat.opacity = lineBase;
      backMat.color.copy(p.line);
      backBase = Math.min(1, p.lineAlpha * 1.5);
      backMat.opacity = backBase;
      // 塗りつぶし・リング・LED は、CSS の色そのままに見えるよう sRGB → リニアに直す(線は少し明るく出るままにしてある)
      const lin = (c: Color) => c.clone().convertSRGBToLinear();
      // ベゼルは、カードの地より少しだけ明るくして、プラスチックの面に見せる
      fillMat.color.copy(lin(p.fill.clone().lerp(p.text, 0.07)));
      fog.color.copy(lin(p.fill));
      ringMat.color.copy(lin(p.text));
      arcMat.color.copy(lin(p.accent));
      ledMat.color.copy(lin(p.accent));
    },
    setBlend: () => {},
    redraw: () => {
      if (!running) render();
    },
  });

  // ---- サイズ: 「ベゼルの上端〜リングの下端」が canvas に収まるよう、カメラの距離と向きを決める ----
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 1 ユニットが何ピクセルになるか。高さで決まる値と、幅で決まる値の小さいほうに合わせる
    const scale = FIT * Math.min(h / (CONTENT_TOP - CONTENT_BOTTOM), w / (CONTENT_HALF_W * 2));
    const visibleHeight = h / scale;
    const visibleWidth = w / scale;
    const dist = visibleHeight / (2 * HALF_TAN);
    // 範囲の中心(x = 0、y = 上端と下端の真ん中)が、canvas の CENTER_X・CENTER_Y の位置に来るようにカメラをずらす
    const camX = (0.5 - (w < NARROW_PX ? CENTER_X_NARROW : CENTER_X)) * visibleWidth;
    const camY = (CONTENT_TOP + CONTENT_BOTTOM) / 2 - visibleHeight / 2 + CENTER_Y * visibleHeight;
    camera.position.set(camX, camY, dist);
    camera.lookAt(camX, camY, 0);
    camera.updateProjectionMatrix();
    // 奥の線ほど背景に溶ける
    fog.near = dist - 1.4;
    fog.far = dist + 3.4;
  }
  const resizeObserver = new ResizeObserver(() => {
    resize();
    if (!running) render();
  });
  resizeObserver.observe(stage);
  resize();

  // ---- 状態 ----
  type Mode = "awake" | "asleep" | "panic";
  let mode: Mode = "awake";
  let idle = 0; // 最後に操作してからの秒数(起きているあいだだけ進む)
  let hovered = false;
  let clickT = 0; // 「click の顔」を出す残り秒数
  let glitch = 0;
  let sleepAmt = 0; // 0 = 起きている、1 = 眠っている(なめらかに変わる)
  let power = 1;
  let panicT = 0;
  let time = 0;
  const clicks: number[] = [];

  const springs = {
    yaw: new Spring(34, 8),
    pitch: new Spring(34, 8),
    roll: new Spring(28, 7),
    hover: new Spring(80, 11),
    squash: new Spring(170, 6.5), // 小さい減衰 = 何度か弾んでから収まる
    wobble: new Spring(55, 3.2),
  };

  let lastLit = -1;
  const emitLevel = (lit: number) => {
    if (lit === lastLit) return;
    lastLit = lit;
    options.onLevel?.(lit);
  };
  const emitState = (s: CrtState) => options.onState?.(s);

  function boing(amount = 1) {
    if (reduceMotion) return;
    springs.squash.v = -8 * amount;
    springs.wobble.v = (Math.random() < 0.5 ? -1 : 1) * 3.5 * amount;
  }

  function wake() {
    mode = "awake";
    idle = 0;
    glitch = Math.max(glitch, 0.85);
    boing(0.5);
    emitState("online");
  }

  function startPanic() {
    mode = "panic";
    panicT = 0;
    clicks.length = 0;
    clickT = 0;
    emitState("panic");
    emitLevel(0);
  }

  function onClick() {
    if (mode === "panic") return;
    const now = performance.now();
    clicks.push(now);
    while (clicks.length > 5) clicks.shift();
    const wasAsleep = mode === "asleep";
    if (wasAsleep) wake();
    idle = 0;
    if (clicks.length === 5 && now - clicks[0] < PANIC_WINDOW_MS) {
      startPanic();
      return;
    }
    clickT = 0.75;
    glitch = Math.max(glitch, 0.4);
    if (!wasAsleep) boing();
  }

  // ---- ポインター(window で受け取り、モニターに乗っているかは Raycaster で判定) ----
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  let ptr: { x: number; y: number } | null = null;
  let ptrMoved = false;
  let touchRelease = 0;

  function hitTest(cx: number, cy: number, r: DOMRect): boolean {
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return false;
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(hitMesh, false).length > 0;
  }

  let down: { x: number; y: number; t: number } | null = null;
  const onPointerMove = (e: PointerEvent) => {
    ptr = { x: e.clientX, y: e.clientY };
    ptrMoved = true;
    window.clearTimeout(touchRelease);
  };
  const onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    ptr = { x: e.clientX, y: e.clientY };
    ptrMoved = true;
    window.clearTimeout(touchRelease);
    if (!running) return;
    if (e.pointerType === "mouse") {
      // マウスは押した瞬間に反応する
      if (hitTest(e.clientX, e.clientY, stage.getBoundingClientRect())) onClick();
    } else {
      // タッチ・ペンは、スクロールの指と区別するため、離したときに「ほぼ動いていない」ものだけを押した扱いにする
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || !e.isPrimary) return;
    if (down && running && performance.now() - down.t < 500 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) {
      if (hitTest(e.clientX, e.clientY, stage.getBoundingClientRect())) onClick();
    }
    down = null;
    // 指を離したら、少ししてから「乗っていない」ことにする(顔が戻る)
    touchRelease = window.setTimeout(() => (ptr = null), 900);
  };
  const onPointerCancel = () => {
    down = null;
    touchRelease = window.setTimeout(() => (ptr = null), 300);
  };
  // モニターの上で押したときに、下のカードの文字が選択されてしまうのを防ぐ
  const onMouseDown = (e: MouseEvent) => {
    if (running && hitTest(e.clientX, e.clientY, stage.getBoundingClientRect())) e.preventDefault();
  };
  const onLeave = () => {
    ptr = null;
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerCancel, { passive: true });
  window.addEventListener("mousedown", onMouseDown);
  document.documentElement.addEventListener("mouseleave", onLeave);
  window.addEventListener("blur", onLeave);

  // ---- 顔 ----
  const face: FaceState = { expression: "idle", lookX: 0, lookY: 0, blink: false, zzz: 0, panicChars: 0 };
  let faceKey = "";
  function setFace(next: Partial<FaceState>) {
    Object.assign(face, next);
    const key = `${face.expression}|${face.lookX}|${face.lookY}|${face.blink}|${face.zzz}|${face.panicChars}`;
    if (key === faceKey) return;
    faceKey = key;
    drawFace(ctx, face);
    texture.needsUpdate = true;
  }

  let gazeX = 0;
  let gazeY = 0;
  let nextBlink = 2.5;
  let blinkClose = 0; // 目を閉じている残り秒数
  let blinkGap = 0; // 二度まばたきするときの、間の秒数
  let blinkAgain = false;

  // ---- 描画ループ ----
  const HEAD_RANGE = { yaw: 0.45, pitch: 0.28, roll: 0.09 };
  const ease = (t: number) => t * t * (3 - 2 * t);

  function updatePanic(dt: number): Expression {
    panicT += dt;
    const TYPE_CPS = 40;
    const T0 = 0.6; // x_x
    const T1 = T0 + PANIC_TOTAL / TYPE_CPS; // 文字を打ち終わる
    const T2 = T1 + 0.85; // そのまま見せる
    const T3 = T2 + 0.3; // 電源オフ(縦に潰れる)
    const T4 = T3 + 0.5; // 真っ暗
    const T5 = T4 + 0.45; // 電源オン
    if (panicT < T0) {
      glitch = 1;
      face.panicChars = 0;
      return "dead";
    }
    if (panicT < T2) {
      // ときどき画面が乱れる
      glitch = 0.12 + (Math.random() < 0.05 ? 0.85 : 0);
      face.panicChars = Math.min(PANIC_TOTAL, Math.floor((panicT - T0) * TYPE_CPS));
      return "panic";
    }
    if (panicT < T3) {
      power = 1 - ease((panicT - T2) / (T3 - T2));
      glitch = 0.1;
      face.panicChars = PANIC_TOTAL;
      return "panic";
    }
    if (panicT < T4) {
      power = 0;
      glitch = 0;
      return "idle";
    }
    if (panicT < T5) {
      power = ease((panicT - T4) / (T5 - T4));
      glitch = 0.7 * (1 - (panicT - T4) / (T5 - T4));
      return "hover";
    }
    // 再起動完了
    power = 1;
    mode = "awake";
    idle = 0;
    glitch = 0.4;
    boing(0.6);
    emitState("online");
    return "hover";
  }

  function frame(now: number) {
    const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0;
    prev = now;
    time += dt;

    const r = stage.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.42;

    // ポインター: 首かしげ用(画面全体に対する位置)、目用(モニターの近くでより敏感)、当たり判定
    let nx = 0;
    let ny = 0;
    let hit = false;
    if (ptr) {
      nx = clamp((ptr.x - cx) / (window.innerWidth * 0.45), -1, 1);
      ny = clamp((ptr.y - cy) / (window.innerHeight * 0.5), -1, 1);
      hit = hitTest(ptr.x, ptr.y, r);
    }
    const gx = ptr ? clamp((ptr.x - cx) / 320, -1, 1) : 0;
    const gy = ptr ? clamp((ptr.y - cy) / 260, -1, 1) : 0;
    gazeX += (gx - gazeX) * (1 - Math.exp(-dt * 9));
    gazeY += (gy - gazeY) * (1 - Math.exp(-dt * 9));

    // 乗った・降りた
    if (hit !== hovered) {
      hovered = hit;
      document.documentElement.style.cursor = hit ? "pointer" : "";
      if (hit) {
        if (mode === "asleep") wake();
        else if (mode === "awake") glitch = Math.max(glitch, 0.9);
      }
    }

    // カード(canvas の範囲)のなかでポインターが動いていたら「操作している」
    if (mode === "awake") {
      const inside = ptr && ptr.x >= r.left && ptr.x <= r.right && ptr.y >= r.top && ptr.y <= r.bottom;
      if ((ptrMoved && inside) || hovered) idle = 0;
      else idle += dt;
      if (idle >= sleepAfter) {
        mode = "asleep";
        emitState("sleep");
      }
    }
    ptrMoved = false;
    if (mode === "awake") emitLevel(Math.ceil(clamp(1 - idle / sleepAfter, 0, 1) * LED_COUNT));
    else if (mode === "asleep") emitLevel(0);

    // 表情
    clickT = Math.max(0, clickT - dt);
    let expression: Expression;
    if (mode === "panic") expression = updatePanic(dt);
    else if (mode === "asleep") expression = "sleep";
    else if (clickT > 0) expression = "click";
    else if (hovered) expression = "hover";
    else expression = "idle";
    if (mode !== "panic") power = 1;

    // まばたき(0.12 秒閉じる。5 回に 1 回くらいは二度続けてする)
    if (blinkClose > 0) {
      blinkClose -= dt;
      if (blinkClose <= 0 && blinkAgain) {
        blinkAgain = false;
        blinkGap = 0.1;
      }
    } else if (blinkGap > 0) {
      blinkGap -= dt;
      if (blinkGap <= 0) blinkClose = 0.12;
    } else {
      nextBlink -= dt;
      if (nextBlink <= 0) {
        blinkClose = 0.12;
        blinkAgain = Math.random() < 0.2;
        nextBlink = 2.2 + Math.random() * 3.4;
      }
    }
    setFace({
      expression,
      lookX: Math.round(gazeX * 4),
      lookY: Math.round(gazeY * 3),
      blink: blinkClose > 0,
      zzz: expression === "sleep" ? Math.floor(time * 1.6) % 4 : 0,
      panicChars: expression === "panic" ? face.panicChars : 0,
    });

    // グリッチは自然に収まっていく(パニック中は updatePanic が決める)
    if (mode !== "panic") glitch = Math.max(0, glitch - dt * 3.2);
    if (reduceMotion) glitch = Math.min(glitch, 0.25);

    // ---- モニターの姿勢 ----
    sleepAmt += ((mode === "asleep" ? 1 : 0) - sleepAmt) * (1 - Math.exp(-dt * 2.2));
    const tracking = ptr && mode === "awake";
    springs.yaw.t = tracking ? nx * HEAD_RANGE.yaw : Math.sin(time * 0.5) * 0.1 * (1 - sleepAmt);
    springs.pitch.t = (tracking ? ny * HEAD_RANGE.pitch : Math.sin(time * 0.37) * 0.04) + 0.2 * sleepAmt;
    springs.roll.t = (tracking ? -nx * HEAD_RANGE.roll : Math.sin(time * 0.43) * 0.025) * (1 - sleepAmt);
    springs.hover.t = hovered && mode === "awake" ? 1 : 0;
    for (const s of Object.values(springs)) s.step(dt);

    const bob = reduceMotion ? 0 : Math.sin(time * 1.3) * 0.045 * (1 - 0.6 * sleepAmt);
    const shake = mode === "panic" && panicT < 0.6 && !reduceMotion ? (Math.random() - 0.5) * 0.08 : 0;
    rig.rotation.set(springs.pitch.x, springs.yaw.x, springs.roll.x + springs.wobble.x * 0.06);
    rig.position.set(shake, bob, springs.hover.x * 0.5);
    const h = 1 + springs.hover.x * 0.035;
    rig.scale.set(h * (1 - springs.squash.x * 0.22), h * (1 + springs.squash.x * 0.32), h * (1 - springs.squash.x * 0.22));

    // リング: シアンの円弧がゆっくり回る。モニターの首かしげに少しだけついてくる
    arcSpin.rotation.z += dt * (0.55 - 0.4 * sleepAmt) * (reduceMotion ? 0 : 1);
    ringTilt.rotation.set(0.2 + springs.pitch.x * 0.2, springs.yaw.x * 0.25, -0.2);
    ringTilt.position.y = -1.38 - bob * 0.5;

    // 電源ランプ: 起きているあいだは点きっぱなし、眠ると呼吸するように明滅
    ledMat.opacity = mode === "panic" && power < 1 ? 0.1 : 1 - sleepAmt * (0.75 - 0.25 * Math.sin(time * 2.2));

    screenMat.uniforms.uTime.value = time;
    screenMat.uniforms.uGlitch.value = glitch;
    screenMat.uniforms.uBright.value = 1 - 0.65 * sleepAmt;
    screenMat.uniforms.uPower.value = power;
    // 眠っているあいだは、線も少し暗く
    lineMat.opacity = lineBase * (1 - 0.35 * sleepAmt);
    backMat.opacity = backBase * (1 - 0.35 * sleepAmt);

    render();
  }

  let prev = 0;
  function render() {
    renderer.render(scene, camera);
  }

  // ---- 見えているときだけループを回す ----
  let running = false;
  let visible = true;
  function sync() {
    const shouldRun = visible && !document.hidden;
    if (shouldRun === running) return;
    running = shouldRun;
    prev = 0;
    renderer.setAnimationLoop(running ? frame : null);
  }
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  io.observe(stage);
  document.addEventListener("visibilitychange", sync);

  setFace({});
  emitLevel(LED_COUNT);
  render();
  sync();

  return {
    destroy() {
      renderer.setAnimationLoop(null);
      stopTheme();
      io.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("mousedown", onMouseDown);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
      window.clearTimeout(touchRelease);
      document.documentElement.style.cursor = "";
      for (const d of disposables) d.dispose();
      renderer.dispose();
      el.remove();
    },
  };
}
