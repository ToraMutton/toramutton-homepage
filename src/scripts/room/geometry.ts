// 部屋の形を組み立てる。
//
// 物ごとに Mesh を作ると描画呼び出しが部品数だけ増えるので、
// グループ内の部品を「材質ごと」に 1 つのジオメトリへ合体させる。
// グループ名は将来 GLB へ置き換えるときの境界になる。
//
// 陰影は重い効果を使わず、3 つの安い方法を重ねている。
//   1. 頂点カラー     : 部品の下側を少し暗く焼き込み、平坦な面をなくす
//   2. 接地影         : ぼかした板を 1 つのジオメトリにまとめて、物の足元に敷く
//   3. シャドウマップ : 形が変わったときだけ更新する（scene.ts）
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  ROOM_CYAN,
  ROOM_LAYOUT,
  ROOM_MATERIAL_KEYS,
  type RoomMaterialKey,
  type RoomPalette,
  type Vec3,
} from "../../data/roomPrototype";

export type MaterialKey = RoomMaterialKey | "cyan" | "glass" | "screenGlow";

export interface RoomMaterials {
  get(key: MaterialKey): Material;
  applyPalette(palette: RoomPalette): void;
  dispose(): void;
}

export function createRoomMaterials(palette: RoomPalette): RoomMaterials {
  const lit = new Map<RoomMaterialKey, MeshLambertMaterial>(
    ROOM_MATERIAL_KEYS.map((key) => [
      key,
      new MeshLambertMaterial({
        color: palette.colors[key],
        flatShading: true,
        vertexColors: true,
      }),
    ]),
  );
  // 自分で光る部分は照明の影響を受けない
  const cyan = new MeshBasicMaterial({ color: ROOM_CYAN });
  const screenGlow = new MeshBasicMaterial({ color: "#153540" });
  const glass = new MeshBasicMaterial({
    color: "#9fd8e0",
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
  });
  return {
    get(key) {
      if (key === "cyan") return cyan;
      if (key === "screenGlow") return screenGlow;
      if (key === "glass") return glass;
      return lit.get(key)!;
    },
    applyPalette(next) {
      for (const [key, material] of lit) material.color.set(next.colors[key]);
    },
    dispose() {
      lit.forEach((material) => material.dispose());
      cyan.dispose();
      screenGlow.dispose();
      glass.dispose();
    },
  };
}

// 部品の複製元。これ自体は描画に使わない（描画すると three.js が破棄用のリスナーを登録し、
// ページをまたいで生き残るこの変数が古いレンダラーを掴み続けてしまう）
const unitBox = new BoxGeometry(1, 1, 1);
const cylinderCache = new Map<string, CylinderGeometry>();
const unitCylinder = (segments: number, topRatio = 1) => {
  const key = `${segments}:${topRatio}`;
  let geometry = cylinderCache.get(key);
  if (!geometry) {
    geometry = new CylinderGeometry(topRatio, 1, 1, segments);
    cylinderCache.set(key, geometry);
  }
  return geometry;
};

type Rotation = readonly [number, number, number];
type Ao = readonly [number, number];
const ZERO: Rotation = [0, 0, 0];
/** 部品の下端と上端の明るさ。下を少し落とすだけで箱らしさが減る */
const DEFAULT_AO: Ao = [0.8, 1];
const FLAT: Ao = [1, 1];
const scratch = {
  position: new Vector3(),
  scale: new Vector3(),
  quaternion: new Quaternion(),
  euler: new Euler(),
};

function composeMatrix(position: Vec3, rotation: Rotation, scale: Vec3) {
  return new Matrix4().compose(
    scratch.position.set(...position),
    scratch.quaternion.setFromEuler(scratch.euler.set(...rotation)),
    scratch.scale.set(...scale),
  );
}

function paintAo(geometry: BufferGeometry, [bottom, top]: Ao) {
  const position = geometry.getAttribute("position");
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y < min) min = y;
    if (y > max) max = y;
  }
  const range = max - min || 1;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const value = bottom + (top - bottom) * ((position.getY(i) - min) / range);
    colors.fill(value, i * 3, i * 3 + 3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
}

interface PartsOptions {
  position?: Vec3;
  parent?: Group;
  /** 壁や床は影を落とさない（影の計算を減らし、部屋の外の影も防ぐ） */
  cast?: boolean;
  /** 箱の中の部品。受けると真っ黒になる物は false にする */
  receive?: boolean;
}

/** 1 グループ分の部品を集め、最後に材質ごとへ合体する */
class Parts {
  readonly group: Group;
  private buckets = new Map<MaterialKey, BufferGeometry[]>();

  constructor(
    private materials: RoomMaterials,
    name: string,
    parent: Group,
    private options: PartsOptions = {},
  ) {
    this.group = new Group();
    this.group.name = name;
    this.group.position.set(...(options.position ?? [0, 0, 0]));
    (options.parent ?? parent).add(this.group);
  }

  add(
    material: MaterialKey,
    geometry: BufferGeometry,
    position: Vec3,
    scale: Vec3 = [1, 1, 1],
    rotation: Rotation = ZERO,
    ao: Ao = DEFAULT_AO,
  ) {
    // 合体には形式を揃える必要がある（Icosahedron などは元からインデックスなし）
    const placed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    placed.applyMatrix4(composeMatrix(position, rotation, scale));
    paintAo(placed, ao);
    const bucket = this.buckets.get(material);
    if (bucket) bucket.push(placed);
    else this.buckets.set(material, [placed]);
    return this;
  }

  box(material: MaterialKey, position: Vec3, size: Vec3, rotation?: Rotation, ao?: Ao) {
    return this.add(material, unitBox, position, size, rotation, ao);
  }

  /** 角を落とした箱。全景で輪郭が見える家具にだけ使う */
  soft(
    material: MaterialKey,
    position: Vec3,
    size: Vec3,
    radius = 0.012,
    rotation?: Rotation,
    ao?: Ao,
  ) {
    const geometry = new RoundedBoxGeometry(size[0], size[1], size[2], 1, radius);
    this.add(material, geometry, position, [1, 1, 1], rotation, ao);
    geometry.dispose();
    return this;
  }

  /** 軸は Y。半径 radius、高さ height の円柱 */
  cylinder(
    material: MaterialKey,
    position: Vec3,
    radius: number,
    height: number,
    {
      segments = 10,
      rotation,
      topRatio,
      ao,
    }: { segments?: number; rotation?: Rotation; topRatio?: number; ao?: Ao } = {},
  ) {
    return this.add(
      material,
      unitCylinder(segments, topRatio),
      position,
      [radius, height, radius],
      rotation,
      ao,
    );
  }

  /** 使い捨ての形を置く */
  shape(
    material: MaterialKey,
    geometry: BufferGeometry,
    position: Vec3,
    scale?: Vec3,
    rotation?: Rotation,
    ao?: Ao,
  ) {
    this.add(material, geometry, position, scale, rotation, ao);
    geometry.dispose();
    return this;
  }

  finish() {
    for (const [key, geometries] of this.buckets) {
      const merged =
        geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
      if (!merged) throw new Error(`ジオメトリを合体できない: ${key}`);
      if (geometries.length > 1) geometries.forEach((g) => g.dispose());
      const mesh = new Mesh(merged, this.materials.get(key));
      mesh.name = `${this.group.name}:${key}`;
      const emissive = key === "cyan" || key === "glass" || key === "screenGlow";
      mesh.castShadow = this.options.cast !== false && !emissive;
      mesh.receiveShadow = this.options.receive !== false && !emissive;
      this.group.add(mesh);
    }
    this.buckets.clear();
    return this.group;
  }
}

// --- 接地影 -------------------------------------------------------------
function createSoftTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = Math.min(x + 0.5, size - x - 0.5, y + 0.5, size - y - 0.5) / (size * 0.34);
      const t = Math.min(edge, 1);
      image.data[(y * size + x) * 4 + 3] = 255 * t * t * (3 - 2 * t);
    }
  }
  context.putImageData(image, 0, 0);
  return new CanvasTexture(canvas);
}

type ShadowFacing = "up" | "back" | "right" | "left";
const FACING: Record<ShadowFacing, Rotation> = {
  up: [-Math.PI / 2, 0, 0],
  back: [0, 0, 0],
  right: [0, -Math.PI / 2, 0],
  left: [0, Math.PI / 2, 0],
};

/** ぼかした板を集めて 1 ドローにする。透明度は頂点の 4 成分目に持たせる */
class ContactShadows {
  private planes: BufferGeometry[] = [];

  add(facing: ShadowFacing, position: Vec3, width: number, height: number, alpha: number) {
    const plane = new PlaneGeometry(width, height).toNonIndexed();
    plane.applyMatrix4(composeMatrix(position, FACING[facing], [1, 1, 1]));
    const colors = new Float32Array(plane.getAttribute("position").count * 4);
    for (let i = 3; i < colors.length; i += 4) colors[i] = alpha;
    plane.setAttribute("color", new BufferAttribute(colors, 4));
    this.planes.push(plane);
    return this;
  }

  /** 床や机の上で、物の輪郭より少し広く敷く */
  under(position: Vec3, width: number, depth: number, alpha = 0.4, spread = 0.1) {
    return this.add("up", position, width + spread * 2, depth + spread * 2, alpha);
  }

  build() {
    const merged = mergeGeometries(this.planes)!;
    this.planes.forEach((plane) => plane.dispose());
    const texture = createSoftTexture();
    const material = new MeshBasicMaterial({
      alphaMap: null,
      map: texture,
      color: "#ffffff",
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const mesh = new Mesh(merged, material);
    mesh.name = "contact_shadows";
    mesh.renderOrder = 1;
    return { mesh, material, texture };
  }
}

// キーの配列。[id, 幅(キー単位)]。id があるキーだけ単独で選べる
const KEY_ROWS: [string, number][][] = [
  [["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 2]],
  [["", 1.5], ["", 1], ["", 1], ["", 1], ["key_rust", 1], ["key_typescript", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1.5]],
  [["", 1.75], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 2.25]],
  [["", 2.25], ["", 1], ["", 1], ["key_c", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 1], ["", 2.75]],
  [["", 1.25], ["", 1.25], ["", 1.25], ["", 6.25], ["", 1.25], ["", 1.25], ["", 1.25], ["", 1.25]],
];

export interface RoomScreens {
  main: Mesh;
  sub: Mesh;
  clock: Mesh;
  nameplate: Mesh;
  icon: Mesh;
  wallClock: Mesh;
  calendar: Mesh;
  tablet: Mesh;
  laptop: Mesh;
}

export interface RoomModel {
  root: Group;
  /** 画面の面。CanvasTexture は scene.ts が貼る */
  screens: RoomScreens;
  /** 動かす部品の元の位置（選択を解除すると戻す） */
  movable: Map<string, { object: Group | Mesh; home: Vector3; moved: Vector3 }>;
  setContactStrength(value: number): void;
  dispose(): void;
}

export function buildRoomModel(materials: RoomMaterials): RoomModel {
  const root = new Group();
  root.name = "room_root";
  const L = ROOM_LAYOUT;
  const parts = (name: string, options?: PartsOptions) =>
    new Parts(materials, name, root, options);
  const movable: RoomModel["movable"] = new Map();
  const screenGeometry = new PlaneGeometry(1, 1);
  // 単独で動かす部品が共有する箱。unitBox と違い、モデルと一緒に破棄する
  const pieceGeometry = new BoxGeometry(1, 1, 1);
  paintAo(pieceGeometry, [0.86, 1]);
  const contact = new ContactShadows();

  const addScreen = (
    parent: Group,
    name: string,
    position: Vec3,
    size: readonly [number, number],
    rotation: Rotation = ZERO,
    geometry: BufferGeometry = screenGeometry,
  ) => {
    const mesh = new Mesh(geometry);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scale.set(size[0], size[1], 1);
    parent.add(mesh);
    return mesh;
  };

  // --- 床・カーペット ---
  const [floorX, , floorZ] = L.floor.position;
  const [floorW, , floorD] = L.floor.size;
  const floor = parts("floor", { cast: false });
  floor.box("floor", L.floor.position, L.floor.size, ZERO, FLAT);
  floor.box("wallRim", [floorX, -0.13, floorZ], [floorW + 0.12, 0.1, floorD + 0.12], ZERO, [0.82, 1]);
  // 板の継ぎ目。細い線だけで木の床に見える
  for (let i = 1; i < 14; i++) {
    const z = floorZ - floorD / 2 + (floorD / 14) * i;
    floor.box("floorLine", [floorX, 0.0006, z], [floorW, 0.0012, 0.008], ZERO, FLAT);
  }
  floor.finish();

  const carpet = parts("carpet", { cast: false });
  carpet.soft("carpet", L.carpet.position, L.carpet.size, 0.005, ZERO, FLAT);
  carpet.finish();

  // --- 壁（上端の見切りと巾木は参考画像の白い縁）---
  const backZ = L.wallBack.position[2];
  const wallH = L.wallBack.size[1];
  const wallFront = floorZ + floorD / 2;
  const innerBack = backZ + 0.06;
  const innerRight = L.wallRight.position[0] - 0.06;
  const wallBack = parts("wall_back", { cast: false });
  wallBack.box("wallBack", L.wallBack.position, L.wallBack.size, ZERO, [0.86, 1]);
  wallBack.box("wallRim", [0, wallH + 0.025, backZ], [4.56, 0.05, 0.2], ZERO, FLAT);
  wallBack.box("wallRim", [0, 0.05, innerBack + 0.012], [4.4, 0.1, 0.024], ZERO, [0.9, 1]);
  // 左の短い袖壁。外側の白い面が部屋の輪郭を作る
  wallBack.box("wallRim", [-2.2, wallH / 2, -1.36], [0.12, wallH, 0.6], ZERO, [0.78, 1]);
  wallBack.box("wallRim", [-2.2, wallH + 0.025, -1.36], [0.2, 0.05, 0.64], ZERO, FLAT);
  wallBack.finish();

  const wallRight = parts("wall_right", { cast: false });
  wallRight.box("wallRight", L.wallRight.position, L.wallRight.size, ZERO, [0.84, 1]);
  wallRight.box("wallRim", [2.2, wallH + 0.025, floorZ], [0.2, 0.05, floorD + 0.08], ZERO, FLAT);
  wallRight.box("wallRim", [2.2, wallH / 2, wallFront], [0.14, wallH, 0.06], ZERO, [0.82, 1]);
  wallRight.box("wallRim", [innerRight - 0.012, 0.05, floorZ], [0.024, 0.1, floorD], ZERO, [0.9, 1]);
  // 掲示板。穴あきの板に紙が留まっている
  wallRight.soft("black", [innerRight - 0.016, 1.5, 0.05], [0.03, 0.78, 1.14], 0.008);
  wallRight.box("paper", [innerRight - 0.034, 1.66, -0.26], [0.006, 0.26, 0.32], ZERO, FLAT);
  wallRight.box("wallRight", [innerRight - 0.036, 1.66, -0.26], [0.006, 0.17, 0.26], ZERO, [0.7, 1.05]);
  wallRight.box("gray", [innerRight - 0.034, 1.3, -0.24], [0.006, 0.22, 0.34], ZERO, FLAT);
  wallRight.box("charcoal", [innerRight - 0.034, 1.62, 0.1], [0.006, 0.12, 0.12], ZERO, FLAT);
  wallRight.box("paper", [innerRight - 0.034, 1.55, 0.42], [0.006, 0.42, 0.24], ZERO, FLAT);
  for (let i = 0; i < 3; i++) {
    wallRight.box("wallRight", [innerRight - 0.037, 1.67 - i * 0.1, 0.42], [0.004, 0.06, 0.16], ZERO, FLAT);
  }
  wallRight.box("paper", [innerRight - 0.034, 1.26, 0.42], [0.006, 0.16, 0.2], ZERO, FLAT);
  wallRight.finish();

  // 壁の時計とカレンダー。表面の絵は screens.ts
  const wallItems = parts("wall_items", { cast: false });
  const clockPos: Vec3 = [-0.9, 1.84, innerBack + 0.03];
  wallItems.cylinder("black", clockPos, 0.2, 0.05, {
    segments: 28,
    rotation: [Math.PI / 2, 0, 0],
  });
  const calendarPos: Vec3 = [0.92, 1.56, innerBack + 0.006];
  wallItems.box("paper", calendarPos, [0.42, 0.48, 0.01], ZERO, FLAT);
  const wallItemsGroup = wallItems.finish();
  const wallClock = addScreen(
    wallItemsGroup,
    "screen_wall_clock",
    [clockPos[0], clockPos[1], clockPos[2] + 0.026],
    [0.36, 0.36],
    ZERO,
    new CircleGeometry(0.5, 28),
  );
  const calendar = addScreen(
    wallItemsGroup,
    "screen_calendar",
    [calendarPos[0], calendarPos[1], calendarPos[2] + 0.0055],
    [0.42, 0.48],
  );

  // --- 机 ---
  const desk = parts("desk");
  desk.soft("desk", L.deskTop.position, L.deskTop.size, 0.012, ZERO, FLAT);
  const [deskX, , deskZ] = L.deskTop.position;
  const legs: [number, number][] = [];
  for (const x of [deskX - 1.66, deskX + 1.66]) {
    for (const z of [deskZ - 0.32, deskZ + 0.32]) {
      desk.soft("black", [x, 0.36, z], [0.1, 0.72, 0.1], 0.008, ZERO, [0.72, 1]);
      legs.push([x, z]);
    }
  }
  // 天板下の幕板。机の厚みが増して見える
  desk.box("black", [deskX, 0.69, deskZ - 0.2], [3.2, 0.06, 0.03]);
  // デスクマット。シアンの細い縁は下の板を少しはみ出させて作る
  desk.box("keyAccent", [-0.28, 0.7815, -0.68], [1.325, 0.003, 0.495], ZERO, FLAT);
  desk.box("black", [-0.28, 0.7835, -0.68], [1.32, 0.003, 0.49], ZERO, FLAT);
  desk.finish();

  // --- メインモニター（表示面 16:10）---
  const monitor = parts("monitor_main");
  const [mx, my, mz] = L.monitorMain.position;
  const [mw, mh] = L.monitorMain.size;
  monitor.soft("black", [mx, my, mz - 0.028], [mw + 0.036, mh + 0.04, 0.045], 0.01, ZERO, FLAT);
  monitor.soft("charcoal", [mx, my, mz - 0.075], [mw * 0.7, mh * 0.68, 0.06], 0.02);
  // アーム: 机の根元から立ち上がり、背面の受けへつながる
  monitor.cylinder("black", [mx + 0.32, 0.8, -1.22], 0.085, 0.024, { segments: 14 });
  monitor.cylinder("black", [mx + 0.32, 0.97, -1.22], 0.028, 0.34);
  monitor.soft("black", [mx + 0.16, 1.13, -1.235], [0.36, 0.05, 0.05], 0.012);
  monitor.soft("charcoal", [mx, 1.13, -1.215], [0.16, 0.16, 0.05], 0.01);
  // 上のライトバー
  monitor.cylinder("black", [mx, my + mh / 2 + 0.07, mz + 0.022], 0.017, mw * 0.72, {
    segments: 8,
    rotation: [0, 0, Math.PI / 2],
  });
  monitor.box("black", [mx, my + mh / 2 + 0.04, mz - 0.02], [0.07, 0.05, 0.075]);
  const monitorGroup = monitor.finish();
  const screenMain = addScreen(monitorGroup, "screen_main", [mx, my, mz], [mw, mh]);

  // --- 縦モニター ---
  const sub = parts("monitor_sub");
  const [sx, sy, sz] = L.monitorSub.position;
  const [sw, sh] = L.monitorSub.size;
  sub.soft("black", [sx, sy, sz], [sw, sh, 0.045], 0.012, ZERO, FLAT);
  sub.soft("charcoal", [sx, sy, sz - 0.04], [sw * 0.6, sh * 0.5, 0.04], 0.015);
  sub.box("black", [sx, 0.85, sz - 0.07], [0.09, 0.14, 0.05]);
  sub.soft("black", [sx, 0.792, sz - 0.03], [0.32, 0.024, 0.22], 0.008);
  const subGroup = sub.finish();
  const screenSub = addScreen(subGroup, "screen_sub", [sx, sy, sz + 0.0232], [sw - 0.034, sh - 0.034]);

  // --- キーボード（通常のキーは 1 つの InstancedMesh に）---
  const keyboardParts = parts("keyboard", { position: L.keyboard.position });
  keyboardParts.soft("charcoal", [0, -0.008, 0], [0.525, 0.024, 0.185], 0.006);
  const keyboard = keyboardParts.finish();
  const pitch = 0.0335;
  const keyMatrices: Matrix4[] = [];
  const keyHeight = 0.012;
  KEY_ROWS.forEach((row, rowIndex) => {
    const rowWidth = row.reduce((sum, [, w]) => sum + w, 0) * pitch;
    let cursor = -rowWidth / 2;
    for (const [id, units] of row) {
      const width = units * pitch;
      const position: Vec3 = [cursor + width / 2, 0.009, (rowIndex - 2) * pitch];
      cursor += width;
      if (id) {
        const key = new Mesh(pieceGeometry, materials.get("keyAccent"));
        key.name = id;
        key.castShadow = true;
        key.position.set(...position);
        key.scale.set(width - 0.005, keyHeight, pitch - 0.005);
        keyboard.add(key);
        movable.set(id, {
          object: key,
          home: key.position.clone(),
          moved: key.position.clone().setY(position[1] - 0.006),
        });
      } else {
        keyMatrices.push(composeMatrix(position, ZERO, [width - 0.005, keyHeight, pitch - 0.005]));
      }
    }
  });
  const keys = new InstancedMesh(pieceGeometry, materials.get("black"), keyMatrices.length);
  keys.name = "keyboard:keys";
  keys.receiveShadow = true;
  keyMatrices.forEach((matrix, i) => keys.setMatrixAt(i, matrix));
  keyboard.add(keys);

  // --- 椅子（背中が -Z の机とは反対の +Z 側。足元から組む）---
  const chair = parts("chair", { position: [L.chair.position[0], 0, L.chair.position[2]] });
  const seatY = 0.52;
  chair.soft("charcoal", [0, seatY, -0.02], [0.56, 0.1, 0.54], 0.04, ZERO, [0.7, 1]);
  chair.soft("black", [0, seatY - 0.075, 0], [0.3, 0.05, 0.3], 0.012);
  chair.cylinder("metal", [0, 0.34, 0], 0.026, 0.2);
  chair.cylinder("black", [0, 0.22, 0], 0.042, 0.18, { topRatio: 0.72 });
  chair.cylinder("black", [0, 0.135, 0], 0.075, 0.04, { segments: 10 });
  // 五本脚とキャスター
  const reach = 0.34;
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.31;
    const cx = Math.cos(angle);
    const sz2 = Math.sin(angle);
    chair.soft("black", [cx * reach * 0.52, 0.112, sz2 * reach * 0.52], [reach, 0.034, 0.066], 0.012, [0, -angle, -0.09]);
    chair.cylinder("charcoal", [cx * reach, 0.078, sz2 * reach], 0.012, 0.03, { segments: 6 });
    chair.shape("black", new SphereGeometry(0.036, 8, 6), [cx * reach, 0.036, sz2 * reach], [1, 1, 1.25], [0, -angle, 0]);
    contact.under([L.chair.position[0] + cx * reach, 0.0135, L.chair.position[2] + sz2 * reach], 0.05, 0.05, 0.42, 0.03);
  }
  // 背もたれ: 六角形の枠と、一段奥の面。全景の輪郭を決める部品
  const backOutline = (w: number, h: number) => {
    const shape = new Shape();
    shape.moveTo(-w * 0.34, -h / 2);
    shape.lineTo(w * 0.34, -h / 2);
    shape.lineTo(w / 2, -h * 0.1);
    shape.lineTo(w * 0.42, h * 0.44);
    shape.lineTo(w * 0.28, h / 2);
    shape.lineTo(-w * 0.28, h / 2);
    shape.lineTo(-w * 0.42, h * 0.44);
    shape.lineTo(-w / 2, -h * 0.1);
    shape.closePath();
    return shape;
  };
  const backTilt: Rotation = [0.14, 0, 0];
  const extrude = (w: number, h: number, depth: number, bevel: number) =>
    new ExtrudeGeometry(backOutline(w, h), {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      steps: 1,
      curveSegments: 1,
    });
  chair.shape("black", extrude(0.6, 0.6, 0.035, 0.012), [0, 0.86, 0.26], [1, 1, 1], backTilt, [0.74, 1]);
  chair.shape("charcoal", extrude(0.48, 0.48, 0.01, 0.004), [0, 0.862, 0.305], [1, 1, 1], backTilt, [0.84, 1]);
  chair.soft("black", [0, 0.56, 0.27], [0.1, 0.34, 0.04], 0.012, [0.14, 0, 0]);
  // 肘掛け: 座面の下から伸びる柱の上にパッドが載る
  for (const side of [-1, 1]) {
    chair.soft("black", [side * 0.29, 0.49, 0.03], [0.1, 0.03, 0.05], 0.008);
    chair.soft("black", [side * 0.335, 0.59, 0.03], [0.04, 0.2, 0.05], 0.01);
    chair.soft("charcoal", [side * 0.335, 0.7, -0.01], [0.085, 0.032, 0.3], 0.013);
  }
  chair.finish();
  contact.under([L.chair.position[0], 0.0135, L.chair.position[2]], 0.5, 0.5, 0.34, 0.16);

  // --- 本棚（開口は -X 向き）---
  const [bx, bcy, bz] = L.bookshelf.position;
  const [bw, bh, bd] = L.bookshelf.size;
  const shelf = parts("bookshelf", { position: [bx, bcy, bz] });
  const t = 0.04;
  shelf.soft("black", [0, bh / 2 - t / 2, 0], [bw + 0.01, t, bd + 0.01], 0.006, ZERO, FLAT);
  shelf.box("black", [0, -bh / 2 + t / 2, 0], [bw, t, bd], ZERO, FLAT);
  shelf.box("black", [0, 0, 0], [bw, t, bd - 2 * t], ZERO, FLAT);
  shelf.box("black", [0, 0, -bd / 2 + t / 2], [bw, bh, t], ZERO, [0.8, 1]);
  shelf.box("black", [0, 0, bd / 2 - t / 2], [bw, bh, t], ZERO, [0.8, 1]);
  shelf.box("charcoal", [bw / 2 - 0.01, 0, 0], [0.02, bh - 0.01, bd - 2 * t], ZERO, [0.62, 0.9]);
  // 選べない本: 厚みと高さに差を付け、1 冊だけ傾ける
  const shelfTop = t / 2;
  const addBook = (
    target: Parts,
    color: MaterialKey,
    z: number,
    thickness: number,
    height: number,
    y = shelfTop + height / 2,
    rotation: Rotation = ZERO,
  ) => {
    target.soft(color, [0, y, z], [0.23, height, thickness], 0.003, rotation, [0.8, 1]);
    target.box("paper", [0.006, y, z], [0.226, height - 0.012, thickness - 0.01], rotation, FLAT);
    // 背表紙の帯。これがあるだけで角材ではなく本に見える
    target.box("paper", [-0.116, y + height * 0.28, z], [0.002, 0.028, thickness * 0.72], rotation, FLAT);
  };
  let cursor = 0.0;
  const others: [MaterialKey, number, number][] = [
    ["bookA", 0.042, 0.32],
    ["bookB", 0.03, 0.29],
    ["bookD", 0.052, 0.34],
    ["bookA", 0.034, 0.3],
  ];
  for (const [color, thickness, height] of others) {
    addBook(shelf, color, cursor + thickness / 2 - 0.1, thickness, height);
    cursor += thickness + 0.002;
  }
  addBook(shelf, "bookC", 0.095, 0.036, 0.31, shelfTop + 0.15, [0.22, 0, 0]); // 傾いた 1 冊
  // 下段: 蓋付きの箱と、寝かせた本
  shelf.soft("gray", [0, -0.25, 0.2], [0.27, 0.22, 0.42], 0.006);
  shelf.soft("paper", [0, -0.13, 0.2], [0.285, 0.03, 0.44], 0.006, ZERO, [0.9, 1]);
  shelf.soft("bookD", [0, -0.45, -0.3], [0.22, 0.03, 0.26], 0.003);
  shelf.soft("bookA", [0.005, -0.42, -0.3], [0.2, 0.026, 0.24], 0.003);
  const shelfGroup = shelf.finish();

  const books: [string, MaterialKey, number, number, number][] = [
    ["book_guide", "bookC", -0.47, 0.05, 0.35],
    ["book_pc_build", "bookD", -0.41, 0.038, 0.32],
    ["book_uec_review", "bookB", -0.355, 0.046, 0.34],
  ];
  for (const [name, color, z, thickness, height] of books) {
    const book = new Parts(materials, name, root, { parent: shelfGroup, position: [0, 0, z] });
    addBook(book, color, 0, thickness, height);
    const object = book.finish();
    movable.set(name, {
      object,
      home: object.position.clone(),
      moved: object.position.clone().setX(-0.09),
    });
  }

  // --- PC（机の下のまま。側面 -X、前面 +Z）---
  const [cw, ch, cd] = L.pcCase.size;
  const pcCase = parts("pc_case", { position: L.pcCase.position });
  const edge = 0.018;
  for (const y of [-ch / 2 + edge / 2, ch / 2 - edge / 2]) {
    pcCase.soft("black", [0, y, 0], [cw, edge, cd], 0.005, ZERO, FLAT);
  }
  for (const [x, z] of [
    [-cw / 2 + edge / 2, -cd / 2 + edge / 2],
    [-cw / 2 + edge / 2, cd / 2 - edge / 2],
    [cw / 2 - edge / 2, -cd / 2 + edge / 2],
    [cw / 2 - edge / 2, cd / 2 - edge / 2],
  ] as const) {
    pcCase.box("black", [x, 0, z], [edge, ch, edge]);
  }
  pcCase.box("charcoal", [cw / 2 - 0.006, 0, 0], [0.012, ch - edge, cd - edge], ZERO, [0.72, 0.95]);
  pcCase.box("charcoal", [0, 0, -cd / 2 + 0.006], [cw - edge, ch - edge, 0.012], ZERO, [0.72, 0.95]);
  pcCase.box("black", [0, 0, cd / 2 - 0.006], [cw - edge, ch - edge, 0.012], ZERO, FLAT);
  // 前面ファン 3 基。回転はさせず、シアンの輪だけ見せる
  const ring = new TorusGeometry(0.076, 0.0075, 5, 24);
  for (const y of [-0.2, 0, 0.2]) {
    pcCase.add("cyan", ring, [0, y, cd / 2 + 0.002], undefined, undefined, FLAT);
    pcCase.cylinder("charcoal", [0, y, cd / 2 + 0.001], 0.066, 0.004, { segments: 16, rotation: [Math.PI / 2, 0, 0], ao: FLAT });
    pcCase.cylinder("black", [0, y, cd / 2 + 0.004], 0.024, 0.006, { segments: 10, rotation: [Math.PI / 2, 0, 0], ao: FLAT });
  }
  ring.dispose();
  const caseGroup = pcCase.finish();

  const inside = { parent: caseGroup, receive: false, cast: false };
  const panel = parts("pc_side_panel", { parent: caseGroup, cast: false });
  panel.box("glass", [-cw / 2 + 0.004, 0, 0], [0.004, ch - 0.03, cd - 0.03]);
  panel.finish();

  // 基板は奥の側板に留まり、部品はすべて基板か背面のどちらかに接している
  const boardX = 0.155;
  const boardFace = boardX - 0.006;
  const rear = -cd / 2 + 0.012;
  const board = parts("pc_motherboard", inside);
  board.box("board", [boardX, 0.06, -0.1], [0.012, 0.46, 0.38], ZERO, [0.85, 1.1]);
  board.box("charcoal", [0, -0.255, 0], [cw - edge * 2, 0.1, cd - edge * 2], ZERO, [0.7, 1]); // 電源カバー
  board.box("metal", [boardFace - 0.012, 0.24, rear + 0.012], [0.024, 0.09, 0.022], ZERO, FLAT); // I/O 部
  board.box("black", [boardFace - 0.006, 0.26, -0.13], [0.012, 0.03, 0.2], ZERO, FLAT); // VRM の放熱板
  board.box("black", [boardFace - 0.005, -0.075, -0.1], [0.01, 0.014, 0.25], ZERO, FLAT); // PCIe スロット
  board.box("gray", [boardFace - 0.005, -0.16, -0.1], [0.01, 0.018, 0.2], ZERO, FLAT); // M.2 の放熱板
  board.box("black", [boardFace - 0.008, 0.14, 0.074], [0.016, 0.1, 0.02], ZERO, FLAT); // 電源コネクタ
  // 電源カバーから基板へ上がる太いケーブル
  board.soft("gray", [boardFace - 0.022, -0.05, 0.1], [0.022, 0.31, 0.022], 0.006);
  board.soft("gray", [boardFace - 0.018, 0.1, 0.087], [0.024, 0.024, 0.04], 0.006);
  // 背面ファン
  board.cylinder("black", [0.03, 0.17, rear + 0.016], 0.062, 0.02, { segments: 16, rotation: [Math.PI / 2, 0, 0] });
  board.cylinder("gray", [0.03, 0.17, rear + 0.028], 0.018, 0.006, { segments: 10, rotation: [Math.PI / 2, 0, 0] });
  board.finish();

  // CPU クーラー: 基板の受け金具 → ヒートパイプ → フィンの塔 → ファン
  const cooler = parts("pc_cpu_cooler", inside);
  const coolerY = 0.13;
  const coolerZ = -0.08;
  cooler.box("metal", [boardFace - 0.009, coolerY, coolerZ], [0.018, 0.08, 0.08], ZERO, FLAT);
  for (const dz of [-0.022, 0, 0.022]) {
    cooler.cylinder("metal", [boardFace - 0.05, coolerY, coolerZ + dz], 0.005, 0.07, { segments: 6, rotation: [0, 0, Math.PI / 2] });
  }
  for (let i = 0; i < 9; i++) {
    cooler.box("metal", [0.01 + i * 0.0105, coolerY, coolerZ], [0.0052, 0.125, 0.06], ZERO, FLAT);
  }
  cooler.soft("black", [0.052, coolerY, coolerZ - 0.041], [0.096, 0.125, 0.022], 0.006);
  cooler.cylinder("gray", [0.052, coolerY, coolerZ - 0.052], 0.016, 0.004, { segments: 10, rotation: [Math.PI / 2, 0, 0] });
  cooler.finish();

  // メモリ: 基板のスロットに立つ 2 枚。クーラーの手前
  const memory = parts("pc_memory", inside);
  for (const z of [0.012, 0.034]) {
    memory.box("black", [boardFace - 0.004, coolerY, z], [0.008, 0.15, 0.012], ZERO, FLAT);
    memory.box("gray", [boardFace - 0.03, coolerY, z], [0.046, 0.135, 0.009], ZERO, [0.82, 1]);
    memory.box("cyan", [boardFace - 0.054, coolerY, z], [0.002, 0.125, 0.006]);
  }
  memory.finish();

  // GPU: スロットから手前へ張り出し、後端の金具が背面に留まる
  const gpu = parts("pc_gpu", inside);
  const gpuY = -0.072;
  const gpuZ = rear + 0.16;
  gpu.box("metal", [0.06, gpuY + 0.012, rear + 0.008], [0.135, 0.09, 0.014], ZERO, FLAT); // 金具
  gpu.box("board", [0.078, gpuY + 0.024, gpuZ], [0.14, 0.006, 0.3], ZERO, FLAT); // 基板
  gpu.soft("black", [0.074, gpuY - 0.008, gpuZ], [0.13, 0.054, 0.31], 0.008);
  gpu.box("cyan", [0.008, gpuY - 0.006, gpuZ], [0.002, 0.006, 0.23]);
  for (const dz of [-0.08, 0.08]) {
    gpu.cylinder("charcoal", [0.074, gpuY - 0.036, gpuZ + dz], 0.058, 0.006, { segments: 16 });
    gpu.cylinder("black", [0.074, gpuY - 0.04, gpuZ + dz], 0.02, 0.004, { segments: 10 });
  }
  gpu.finish();

  // ケース内の天井に細い光。内部の形を読みやすくする
  const led = parts("pc_led", inside);
  led.box("cyan", [-0.1, ch / 2 - 0.022, 0], [0.004, 0.003, cd - 0.08]);
  led.finish();

  // --- 机の上の小物 ---
  const items = parts("desk_items");
  // スピーカー（丸い形）: 脚の上に球、正面に振動板
  const speakers: [number, number][] = [[-1.0, -0.98], [0.44, -0.98]];
  for (const [x, z] of speakers) {
    items.cylinder("black", [x, 0.79, z], 0.06, 0.02, { segments: 12 });
    items.shape("black", new SphereGeometry(0.078, 12, 8), [x, 0.87, z], [1, 1, 1], ZERO, [0.72, 1]);
    items.cylinder("paper", [x, 0.875, z + 0.066], 0.046, 0.016, { segments: 14, rotation: [Math.PI / 2, 0, 0], ao: FLAT });
    items.cylinder("black", [x, 0.875, z + 0.076], 0.024, 0.006, { segments: 10, rotation: [Math.PI / 2, 0, 0], ao: FLAT });
    contact.under([x, 0.7815, z], 0.13, 0.13, 0.5, 0.05);
  }
  // ノートPC
  const lidTilt: Rotation = [-0.22, 0.12, 0];
  const laptopPos: Vec3 = [-1.55, 0.792, -0.62];
  items.soft("metal", laptopPos, [0.5, 0.022, 0.34], 0.008, [0, 0.12, 0], FLAT);
  items.box("black", [-1.553, 0.804, -0.648], [0.44, 0.003, 0.17], [0, 0.12, 0], FLAT);
  items.box("charcoal", [-1.54, 0.804, -0.52], [0.13, 0.003, 0.08], [0, 0.12, 0], FLAT);
  items.soft("metal", [-1.574, 0.955, -0.815], [0.5, 0.33, 0.012], 0.006, lidTilt, FLAT);
  // マウス・メモ・スマホ
  items.shape("black", new SphereGeometry(0.046, 10, 6), [0.1, 0.796, -0.66], [0.82, 0.5, 1.28], ZERO, [0.7, 1]);
  items.box("paper", [0.92, 0.79, -0.76], [0.19, 0.016, 0.24], [0, 0.18, 0], [0.8, 1]);
  items.box("gray", [0.92, 0.799, -0.872], [0.19, 0.004, 0.018], [0, 0.18, 0], FLAT);
  items.soft("black", [1.2, 0.788, -0.76], [0.1, 0.012, 0.2], 0.004, [0, -0.08, 0], FLAT);
  // タブレットとスタンド
  const tabletTilt: Rotation = [-0.2, 0, 0];
  items.soft("black", [1.04, 0.93, -1.14], [0.38, 0.27, 0.016], 0.008, tabletTilt, FLAT);
  items.soft("charcoal", [1.04, 0.79, -1.15], [0.2, 0.02, 0.16], 0.006);
  items.box("charcoal", [1.04, 0.85, -1.17], [0.05, 0.13, 0.02], [-0.3, 0, 0]);
  // 机上の時計: 少し上を向いた台形の箱
  items.soft("black", [-0.38, 0.846, -0.94], [0.36, 0.13, 0.09], 0.016, [-0.12, 0, 0], [0.7, 1]);
  const itemsGroup = items.finish();
  const clockFace = addScreen(itemsGroup, "screen_clock", [-0.38, 0.848, -0.893], [0.32, 0.098], [-0.12, 0, 0]);
  const laptopScreen = addScreen(itemsGroup, "screen_laptop", [-1.573, 0.955, -0.8075], [0.46, 0.29], lidTilt);
  const tabletScreen = addScreen(itemsGroup, "screen_tablet", [1.04, 0.931, -1.1305], [0.35, 0.24], tabletTilt);

  // ヘッドセット: 穴あき板のフックに掛かる。頭の輪＋左右のイヤーカップ
  const headset = parts("headset_board");
  const hx = -1.93;
  const hz = innerBack + 0.02;
  headset.soft("black", [hx, 1.1, hz], [0.32, 0.72, 0.02], 0.006, ZERO, FLAT);
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 3; col++) {
      headset.box("charcoal", [hx - 0.1 + col * 0.1, 0.8 + row * 0.1, hz + 0.0105], [0.012, 0.012, 0.002], ZERO, FLAT);
    }
  }
  headset.box("metal", [hx, 1.36, hz + 0.04], [0.016, 0.016, 0.07], ZERO, FLAT); // フック
  const band = new TorusGeometry(0.09, 0.012, 6, 14, Math.PI);
  headset.add("black", band, [hx, 1.27, hz + 0.075], undefined, undefined, [0.9, 1]);
  band.dispose();
  for (const side of [-1, 1]) {
    headset.cylinder("charcoal", [hx + side * 0.09, 1.235, hz + 0.075], 0.008, 0.07, { segments: 6 });
    headset.shape("black", new SphereGeometry(0.058, 10, 6), [hx + side * 0.096, 1.18, hz + 0.075], [0.7, 1.1, 1], ZERO, [0.72, 1]);
  }
  // 吊るしたタグ
  headset.box("bookC", [hx - 0.06, 0.98, hz + 0.018], [0.05, 0.09, 0.006]);
  headset.box("leaf", [hx + 0.02, 0.9, hz + 0.018], [0.05, 0.09, 0.006]);
  headset.finish();

  // --- 自己紹介の 2 つ ---
  const nameplate = parts("profile_nameplate", { position: L.nameplate.position });
  // 上を向いて傾いた卓上名札
  nameplate.soft("black", [0, -0.012, 0], [0.27, 0.066, 0.028], 0.005, [-0.45, 0, 0], FLAT);
  nameplate.box("black", [0, -0.03, -0.028], [0.25, 0.012, 0.05]);
  const nameplateGroup = nameplate.finish();
  const nameFace = addScreen(nameplateGroup, "screen_nameplate", [0, -0.0052, 0.0143], [0.24, 0.05], [-0.45, 0, 0]);

  const frame = parts("profile_icon_frame", { position: L.iconFrame.position });
  frame.soft("metal", [0, 0, 0], [0.21, 0.25, 0.018], 0.006, [-0.1, 0, 0], FLAT);
  frame.box("black", [0, -0.05, -0.05], [0.05, 0.2, 0.01], [0.42, 0, 0]);
  const frameGroup = frame.finish();
  const iconFace = addScreen(frameGroup, "screen_icon", [0, 0.002, 0.0098], [0.17, 0.17], [-0.1, 0, 0]);

  // --- 観葉植物（参考画像の右奥）---
  const plantPos: Vec3 = [1.64, 0, -1.18];
  const plant = parts("plant", { position: plantPos });
  plant.cylinder("pot", [0, 0.17, 0], 0.17, 0.34, { segments: 8, topRatio: 1.24, ao: [0.76, 1] });
  plant.cylinder("charcoal", [0, 0.342, 0], 0.17, 0.008, { segments: 8, ao: FLAT });
  const leaf = new OctahedronGeometry(1, 0);
  for (let i = 0; i < 15; i++) {
    const angle = i * 2.4;
    const level = i / 14;
    const height = 0.56 + level * 0.56;
    const reach = 0.3 - level * 0.14;
    const color: MaterialKey = i % 3 === 1 ? "leafDark" : "leaf";
    plant.cylinder("leafDark", [Math.cos(angle) * reach * 0.42, 0.34 + (height - 0.34) * 0.5, Math.sin(angle) * reach * 0.42], 0.007, height - 0.32, {
      segments: 4,
      rotation: [Math.sin(angle) * 0.34, 0, -Math.cos(angle) * 0.34],
    });
    plant.add(
      color,
      leaf,
      [Math.cos(angle) * (reach + 0.08), height, Math.sin(angle) * (reach + 0.08)],
      [0.25 - level * 0.05, 0.02, 0.115 - level * 0.02],
      [0, -angle, -0.42 + level * 0.6],
      FLAT,
    );
  }
  plant.finish();
  leaf.dispose();

  // --- 接地影と部屋の隅の暗さ ---
  const floorY = 0.0025;
  const carpetY = 0.0135;
  const deskY = 0.7855;
  // 壁と床、壁どうしの境目
  contact.add("up", [0, floorY, innerBack + 0.2], 4.3, 0.52, 0.28);
  contact.add("up", [innerRight - 0.2, floorY, floorZ], 0.52, floorD, 0.26);
  contact.add("back", [innerRight - 0.12, wallH / 2, innerBack + 0.002], 0.36, wallH, 0.2);
  contact.add("left", [innerRight - 0.002, wallH / 2, innerBack + 0.14], 0.36, wallH, 0.24);
  contact.add("back", [0, wallH - 0.08, innerBack + 0.002], 4.3, 0.26, 0.12);
  contact.add("left", [innerRight - 0.002, wallH - 0.08, floorZ], floorD, 0.26, 0.14);
  // 机の下は全体に少し暗い。カーペットの上にも敷く
  contact.under([deskX, carpetY, deskZ], 3.3, 0.72, 0.42, 0.2);
  for (const [x, z] of legs) contact.under([x, carpetY, z], 0.1, 0.1, 0.55, 0.06);
  contact.under([L.pcCase.position[0], carpetY, L.pcCase.position[2]], 0.36, 0.6, 0.62, 0.09);
  contact.under([bx, floorY + 0.001, bz], 0.4, 1.2, 0.5, 0.1);
  contact.under([plantPos[0], floorY + 0.001, plantPos[2]], 0.3, 0.3, 0.5, 0.1);
  contact.add("up", [L.carpet.position[0], floorY, L.carpet.position[2]], L.carpet.size[0] + 0.1, L.carpet.size[2] + 0.1, 0.28);
  // 壁に掛かった物の周り
  contact.add("back", [-0.9, 1.82, innerBack + 0.002], 0.5, 0.5, 0.3);
  contact.add("back", [mx, my - 0.02, innerBack + 0.002], mw + 0.26, mh + 0.2, 0.26);
  contact.add("back", [sx, sy - 0.02, innerBack + 0.002], sw + 0.2, sh + 0.14, 0.24);
  contact.add("back", [calendarPos[0], calendarPos[1] - 0.01, innerBack + 0.002], 0.5, 0.56, 0.2);
  contact.add("back", [hx, 1.1, innerBack + 0.002], 0.4, 0.8, 0.26);
  contact.add("left", [innerRight - 0.003, 1.49, 0.05], 1.24, 0.88, 0.28);
  // 机の上の小物
  contact.under([-0.42, deskY, -0.66], 0.525, 0.185, 0.6, 0.04);
  contact.under([-0.38, deskY, -0.93], 0.36, 0.09, 0.55, 0.05);
  contact.under([laptopPos[0], deskY, laptopPos[2]], 0.5, 0.34, 0.5, 0.05);
  contact.under([0.1, deskY, -0.66], 0.08, 0.12, 0.5, 0.03);
  contact.under([0.92, deskY, -0.76], 0.19, 0.24, 0.4, 0.03);
  contact.under([1.2, deskY, -0.76], 0.1, 0.2, 0.4, 0.03);
  contact.under([1.04, deskY, -1.15], 0.22, 0.18, 0.5, 0.05);
  contact.under([0.62, deskY, -0.92], 0.26, 0.09, 0.5, 0.03);
  contact.under([0.64, deskY, -1.17], 0.18, 0.12, 0.45, 0.04);
  contact.under([sx, deskY, sz - 0.03], 0.32, 0.22, 0.5, 0.05);
  contact.under([mx + 0.32, deskY, -1.22], 0.17, 0.17, 0.5, 0.04);
  // 棚の奥。開口から覗く背板を暗くする
  const shelfBack = bx + bw / 2 - 0.022;
  contact.add("right", [shelfBack, bcy + 0.24, bz], bd - 0.1, 0.46, 0.55);
  contact.add("right", [shelfBack, bcy - 0.24, bz], bd - 0.1, 0.46, 0.55);
  contact.under([bx - 0.02, bcy + 0.0215, bz - 0.2], 0.25, 0.6, 0.5, 0.03);
  contact.under([bx, bcy - 0.4785, bz + 0.2], 0.28, 0.44, 0.5, 0.03);

  const shadows = contact.build();
  root.add(shadows.mesh);
  const contactBase = shadows.material.opacity;

  const owned = new Set<BufferGeometry>();
  root.traverse((object) => {
    if (object instanceof Mesh) owned.add(object.geometry);
  });

  return {
    root,
    screens: {
      main: screenMain,
      sub: screenSub,
      clock: clockFace,
      nameplate: nameFace,
      icon: iconFace,
      wallClock,
      calendar,
      tablet: tabletScreen,
      laptop: laptopScreen,
    },
    movable,
    setContactStrength(value) {
      shadows.material.opacity = contactBase * value;
    },
    dispose() {
      owned.forEach((geometry) => geometry.dispose());
      screenGeometry.dispose();
      keys.dispose();
      shadows.texture.dispose();
      shadows.material.dispose();
    },
  };
}
