// モニターや名札の表面に描く絵。文字は仮表示で、同じ情報は必ず右の HTML にもある。
import {
  CanvasTexture,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SRGBColorSpace,
  type Mesh,
} from "three";
import { asciiAvatar } from "../../data/asciiAvatar";
import type { RoomScreens } from "./geometry";

const INK = "#0c1b22";
const TEXT = "#d7e7ea";
const MUTED = "#6f8f97";
const CYAN = "#22d3ee";
const MONO = "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace";

interface Surface {
  context: CanvasRenderingContext2D;
  texture: CanvasTexture;
  material: MeshBasicMaterial | MeshLambertMaterial;
}

/** lit は紙や文字盤のように、部屋の明るさに合わせて暗くなる面 */
function createSurface(mesh: Mesh, width: number, height: number, lit = false): Surface {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas を作れない");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = lit
    ? new MeshLambertMaterial({ map: texture })
    : new MeshBasicMaterial({ map: texture });
  mesh.material = material;
  mesh.receiveShadow = lit;
  return { context, texture, material };
}

function fill({ context }: Surface, color: string) {
  context.fillStyle = color;
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
}

function drawMainDefault(surface: Surface) {
  const { context } = surface;
  fill(surface, INK);
  // 画面の奥行き。ごく弱い光だけ足す
  const glow = context.createRadialGradient(330, 320, 40, 330, 320, 620);
  glow.addColorStop(0, "#14404c");
  glow.addColorStop(1, INK);
  context.fillStyle = glow;
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  context.textBaseline = "top";
  context.font = `15px ${MONO}`;
  context.fillStyle = CYAN;
  asciiAvatar.forEach((line, i) => context.fillText(line, 28, 44 + i * 17));
  context.fillStyle = TEXT;
  context.font = `bold 30px ${MONO}`;
  context.fillText("toramutton", 640, 200);
  context.fillStyle = MUTED;
  context.font = `22px ${MONO}`;
  context.fillText("Arch Linux", 640, 256);
  context.fillText("Hyprland", 640, 290);
  surface.texture.needsUpdate = true;
}

function drawMainWork(surface: Surface, label: string, image: HTMLImageElement | null) {
  const { context } = surface;
  const { width, height } = context.canvas;
  fill(surface, INK);
  if (image) {
    // 16:10 の画面いっぱいに切り抜く
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  }
  context.fillStyle = "rgba(12, 27, 34, 0.82)";
  context.fillRect(0, height - 64, width, 64);
  context.fillStyle = CYAN;
  context.font = `bold 30px ${MONO}`;
  context.textBaseline = "middle";
  context.fillText(`$ open ${label}`, 28, height - 32);
  surface.texture.needsUpdate = true;
}

/** 壁の時計は開いた時刻を指す。秒は更新しないが、でたらめな時刻も見せない */
function drawWallClock(surface: Surface) {
  const { context } = surface;
  const size = context.canvas.width;
  const center = size / 2;
  fill(surface, "#f4f0ea");
  context.translate(center, center);
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    context.fillStyle = "#26262b";
    context.save();
    context.rotate((i / 60) * Math.PI * 2);
    context.fillRect(major ? -3 : -1, -center + 12, major ? 6 : 2, major ? 26 : 12);
    context.restore();
  }
  const now = new Date();
  const minutes = now.getMinutes();
  const hours = (now.getHours() % 12) + minutes / 60;
  const hand = (turn: number, length: number, width: number) => {
    context.save();
    context.rotate(turn * Math.PI * 2);
    context.fillRect(-width / 2, -length, width, length + 14);
    context.restore();
  };
  hand(hours / 12, size * 0.25, 10);
  hand(minutes / 60, size * 0.37, 6);
  context.beginPath();
  context.arc(0, 0, 10, 0, Math.PI * 2);
  context.fill();
  context.setTransform(1, 0, 0, 1, 0, 0);
  surface.texture.needsUpdate = true;
}

function drawCalendar(surface: Surface) {
  const { context } = surface;
  const { width, height } = context.canvas;
  fill(surface, "#f1ece4");
  context.fillStyle = "#5f8f8f";
  context.fillRect(0, 0, width, height * 0.16);
  context.fillStyle = "#b9b2a8";
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 7; col++) {
      context.fillRect(width * 0.1 + col * width * 0.118, height * 0.27 + row * height * 0.135, width * 0.05, height * 0.045);
    }
  }
  surface.texture.needsUpdate = true;
}

function drawTablet(surface: Surface) {
  const { context } = surface;
  const { width, height } = context.canvas;
  fill(surface, "#14222b");
  ["#6fa8b8", "#7fb89a", "#d9a06f"].forEach((color, i) => {
    context.fillStyle = color;
    context.fillRect(width * (0.14 + i * 0.26), height * 0.32, width * 0.2, height * 0.4);
  });
  surface.texture.needsUpdate = true;
}

function drawLaptop(surface: Surface) {
  const { context } = surface;
  const { width } = context.canvas;
  fill(surface, INK);
  context.fillStyle = "#1c3640";
  context.fillRect(0, 0, width, 22);
  for (let i = 0; i < 12; i++) {
    context.fillStyle = i % 4 === 1 ? CYAN : "#47636c";
    context.fillRect(20 + (i % 3) * 18, 42 + i * 17, 70 + ((i * 47) % 150), 6);
  }
  surface.texture.needsUpdate = true;
}

function drawSub(surface: Surface) {
  const { context } = surface;
  const { width } = context.canvas;
  fill(surface, INK);
  context.fillStyle = "#1c3640";
  context.fillRect(0, 0, width, 40);
  context.fillStyle = CYAN;
  context.fillRect(16, 14, 60, 12);
  // 文字ではなく行の並びだけを見せる
  for (let i = 0; i < 26; i++) {
    const lineWidth = 80 + ((i * 53) % 190);
    context.fillStyle = i % 7 === 3 ? CYAN : "#47636c";
    context.fillRect(48, 72 + i * 22, lineWidth, 8);
    context.fillStyle = "#2a4852";
    context.fillRect(20, 70 + i * 22, 12, 12);
  }
  surface.texture.needsUpdate = true;
}

function drawClock(surface: Surface, buildLabel: string) {
  const { context } = surface;
  const { width, height } = context.canvas;
  fill(surface, "#101317");
  context.textBaseline = "middle";
  context.fillStyle = MUTED;
  context.font = `bold 34px ${MONO}`;
  context.fillText("BUILD", 28, height / 2);
  context.fillStyle = TEXT;
  context.font = `44px ${MONO}`;
  context.textAlign = "right";
  context.fillText(buildLabel, width - 24, height / 2);
  context.textAlign = "left";
  surface.texture.needsUpdate = true;
}

function drawNameplate(surface: Surface) {
  const { context } = surface;
  const { width, height } = context.canvas;
  fill(surface, "#17181c");
  context.fillStyle = TEXT;
  context.font = `bold 52px ${MONO}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("toramutton", width / 2, height / 2);
  context.textAlign = "left";
  surface.texture.needsUpdate = true;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`画像を読めない: ${url}`));
    image.src = url;
  });
}

export function createScreens(
  screens: RoomScreens,
  assets: { iconUrl?: string; buildLabel: string },
  invalidate: () => void,
) {
  const main = createSurface(screens.main, 1024, 640);
  const sub = createSurface(screens.sub, 360, 666);
  const clock = createSurface(screens.clock, 512, 156);
  const nameplate = createSurface(screens.nameplate, 512, 90);
  const icon = createSurface(screens.icon, 256, 256);
  const wallClock = createSurface(screens.wallClock, 256, 256, true);
  const calendar = createSurface(screens.calendar, 256, 292, true);
  const tablet = createSurface(screens.tablet, 256, 176);
  const laptop = createSurface(screens.laptop, 320, 202);
  const surfaces = [main, sub, clock, nameplate, icon, wallClock, calendar, tablet, laptop];

  drawMainDefault(main);
  drawSub(sub);
  drawClock(clock, assets.buildLabel);
  drawNameplate(nameplate);
  drawWallClock(wallClock);
  drawCalendar(calendar);
  drawTablet(tablet);
  drawLaptop(laptop);
  fill(icon, "#3e3e45");

  let disposed = false;
  // 読み込み中に別の作品を選んだら、古い画像で上書きしない
  let requestId = 0;

  if (assets.iconUrl) {
    loadImage(assets.iconUrl).then(
      (image) => {
        if (disposed) return;
        icon.context.drawImage(image, 0, 0, 256, 256);
        icon.texture.needsUpdate = true;
        invalidate();
      },
      // 写真が読めなくても部屋は成立する
      () => {},
    );
  }

  return {
    showDefault() {
      requestId += 1;
      drawMainDefault(main);
    },
    showWork(label: string, imageUrl?: string) {
      const id = ++requestId;
      drawMainWork(main, label, null);
      if (!imageUrl) return;
      loadImage(imageUrl).then(
        (image) => {
          if (disposed || id !== requestId) return;
          drawMainWork(main, label, image);
          invalidate();
        },
        () => {},
      );
    },
    dispose() {
      disposed = true;
      for (const surface of surfaces) {
        surface.texture.dispose();
        surface.material.dispose();
      }
    },
  };
}
