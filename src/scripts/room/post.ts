// 描いた絵の仕上げ。くっきりしすぎた材質を「写真っぽく」なじませる 3 つの効果。
//
//   1. Bloom    : 明るい所(間接照明・画面)から光が少しにじむ
//   2. Vignette : 画面の四隅を落とし、視線を部屋の中へ集める
//   3. Grain    : ごく弱いノイズ。平らな面のベタ塗り感を消す
//
// 流れ: 部屋を明るさの幅が広い(HDR)画像へ描く → 明るい所だけ抜き出してぼかし、足す(Bloom)
//       → 階調を圧縮して画面の色にする(OutputPass) → 四隅とノイズを重ねる(最後の ShaderPass)
// ノイズを最後に置くのは、階調圧縮の前に足すと明るい所で潰れて見えなくなるため。
import {
  HalfFloatType,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export const ROOM_POST = {
  /** にじみの強さ・広がり・拾い始める明るさ。threshold を上げるほど光る所だけに絞られる */
  bloom: { strength: 0.55, radius: 0.6, threshold: 0.82 },
  /** 四隅の暗さ(0〜1)と、暗くなり始める位置(中心からの距離) */
  vignette: { darkness: 0.62, start: 0.38 },
  /** ノイズの強さ。0.03 を超えると汚れて見える */
  grain: 0.026,
} as const;

const finishShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new Vector2(1, 1) },
    darkness: { value: ROOM_POST.vignette.darkness },
    start: { value: ROOM_POST.vignette.start },
    grain: { value: ROOM_POST.grain },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float darkness;
    uniform float start;
    uniform float grain;
    varying vec2 vUv;

    // 画素の位置から決まる疑似乱数。時間を入れないので、止まった絵では粒も止まる
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // 横長の画面でも四隅が同じように落ちるよう、縦横比をそろえて距離を測る
      vec2 centered = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
      float aspectNorm = length(vec2(resolution.x / resolution.y, 1.0)) * 0.5;
      float distance = length(centered) / aspectNorm;
      float vignette = 1.0 - darkness * smoothstep(start, 1.0, distance);
      color.rgb *= vignette;

      // 暗い所ほど粒が目立つのが写真らしいので、明るさで少しだけ弱める
      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float noise = hash(gl_FragCoord.xy) - 0.5;
      color.rgb += noise * grain * (1.0 - 0.5 * luma);

      gl_FragColor = color;
    }
  `,
};

export function createRoomPost(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
  // HDR(半精度)で描く。8bit だと 1 を超える明るさが切れてしまい、Bloom が光を拾えない。
  // 後処理を挟むとブラウザのアンチエイリアスが効かないので、ここで 4 倍のサンプルを取る
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);

  const bloom = new UnrealBloomPass(
    new Vector2(1, 1),
    ROOM_POST.bloom.strength,
    ROOM_POST.bloom.radius,
    ROOM_POST.bloom.threshold,
  );
  const output = new OutputPass();
  const finish = new ShaderPass(finishShader);
  const finishMaterial = finish.material as ShaderMaterial;

  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(finish);

  return {
    render() {
      composer.render();
    },
    setSize(width: number, height: number) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      const ratio = renderer.getPixelRatio();
      finishMaterial.uniforms.resolution.value.set(width * ratio, height * ratio);
    },
    dispose() {
      bloom.dispose();
      output.dispose();
      finish.dispose();
      composer.dispose();
      target.dispose();
    },
  };
}
