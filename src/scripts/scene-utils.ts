// /about の 3D シーン(ローレンツアトラクタ・CRT モニター)で共通に使う道具。
// トップのメビウス(mobius.ts)と同じ考え方で作ってある(色をテーマに追従させる・光の粒を描く)。

import { Color } from "three";
import { THEME_FADE_MS } from "./theme-switch";

/** CSS 変数の色を three の Color と不透明度にする(rgb(… / 0.28) 形式も読む) */
export function readColor(name: string): { color: Color; alpha: number } {
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

// ---- 光の粒子(彗星のように尾を引く点の列)のシェーダ ----
// alpha と size は頂点ごとの属性。先頭ほど大きく明るく、尾の先ほど小さく透明にする。
export const POINT_VERT = /* glsl */ `
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
export const POINT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * a * vAlpha);
  }
`;

export interface ThemeTrackOptions<P> {
  /** 動きを抑える設定のとき true(色を補間せず、すぐ切り替える) */
  reduceMotion: boolean;
  /** いまの CSS 変数から、シーンの色の組を読む */
  read: () => P;
  /** 色の組 a → b を t(0〜1)で混ぜる */
  lerp: (a: P, b: P, t: number) => P;
  /** 色の組をシーンに反映する */
  apply: (palette: P) => void;
  /** 暗い背景では光を足し算して輝かせ、明るい背景では普通に重ねる、といった切り替え */
  setBlend: (dark: boolean) => void;
  /** 描画ループが止まっているときでも、色の変化を画面に反映するための再描画 */
  redraw: () => void;
}

/**
 * テーマ(<html> の .dark)の切り替えに合わせて、シーンの色を THEME_FADE_MS かけて補間する。
 * WebGL には CSS のトランジションが効かないので、ページ側のフェードと同じ長さを自前で作っている。
 * 戻り値の関数で監視をやめる。
 */
export function trackTheme<P>(o: ThemeTrackOptions<P>): () => void {
  let isDark: boolean | null = null;
  let palette = o.read();
  let raf = 0;

  const onChange = () => {
    const dark = document.documentElement.classList.contains("dark");
    // <html> の class は .theme-fading の付け外しでも変わるので、テーマが変わったときだけ動く
    if (dark === isDark) return;
    const first = isDark === null;
    isDark = dark;
    const target = o.read();

    cancelAnimationFrame(raf);
    if (first || o.reduceMotion) {
      palette = target;
      o.apply(palette);
      o.setBlend(dark);
      return;
    }

    const from = palette;
    const t0 = performance.now();
    let blendSwitched = false;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / THEME_FADE_MS);
      const e = k * k * (3 - 2 * k); // smoothstep
      palette = o.lerp(from, target, e);
      o.apply(palette);
      // 光の重ね方は、色がちょうど半分混ざったところで切り替える
      if (!blendSwitched && k >= 0.5) {
        o.setBlend(dark);
        blendSwitched = true;
      }
      o.redraw();
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  onChange();
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
  };
}
