// 3D の本体。bootstrap.ts から動的 import され、利用条件を満たすまで読み込まれない。
//
// ここが持つのは「カメラが今どこにいるか」まで。どの章を見せるかの判断は
// navigation.ts にあり、scene は言われた視点へ向かうだけ。
import {
  Box3,
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  DETAIL_TARGETS,
  ROOM_PALETTES,
  ROOM_RENDER,
  SECTION_TARGETS,
  VIEWPOINTS,
  fitFov,
  routeTo,
  type RoomTheme,
  type SectionId,
  type Vec3,
} from "../../data/roomPrototype";
import { buildRoomModel, createRoomMaterials } from "./geometry";
import { createRenderScheduler } from "./renderScheduler";
import { createScreens } from "./screens";

export interface RoomPick {
  section: SectionId;
  detail: string | null;
  label: string;
}

export interface RoomSceneOptions {
  host: HTMLElement;
  section: SectionId;
  theme: RoomTheme;
  reducedMotion: boolean;
  iconUrl?: string;
  buildLabel: string;
  /** 判定領域を見えるようにする（?debug=hits） */
  showHitAreas?: boolean;
  onPick(pick: RoomPick): void;
  onHover(pick: RoomPick | null, clientX: number, clientY: number): void;
  onFailure(reason: string): void;
}

interface HitArea {
  mesh: Mesh;
  pick: RoomPick;
  /** このグループ自身の面は遮蔽物として扱わない */
  group: Group | Mesh;
}

const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const toVec3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];

function isVisibleInTree(object: Group | Mesh) {
  for (let o: typeof object.parent | typeof object = object; o; o = o.parent) {
    if (!o.visible) return false;
  }
  return true;
}

function belongsTo(object: Mesh, group: Group | Mesh) {
  for (let o: Mesh["parent"] | Mesh = object; o; o = o.parent) {
    if (o === group) return true;
  }
  return false;
}

/**
 * WebGL が使えないとここで例外になり、bootstrap が error 状態へ落とす。
 * 組み立ての途中で失敗しても WebGL のコンテキストを残さない。
 */
export function createRoomScene(options: RoomSceneOptions) {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  try {
    return assembleRoomScene(options, renderer);
  } catch (error) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
}

function assembleRoomScene(options: RoomSceneOptions, renderer: WebGLRenderer) {
  const { host } = options;
  const canvas = renderer.domElement;
  canvas.className = "room-canvas";
  canvas.setAttribute("aria-hidden", "true");
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, ROOM_RENDER.maxPixelRatio));
  // 部屋はほとんど動かないので、影は形が変わったときだけ描き直す
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.03, 40);
  const materials = createRoomMaterials(ROOM_PALETTES[options.theme]);
  const model = buildRoomModel(materials);
  scene.add(model.root);

  const ambient = new HemisphereLight("#ffffff", "#b9b3c4", 1);
  const sun = new DirectionalLight("#fff4e6", 1);
  // 右壁と机の正面の両方に光が当たる向き（参考画像の左手前上から）
  sun.position.set(-2.6, 6, 4.2);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(window.innerWidth < 960 ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -3.6, right: 3.6, top: 3.6, bottom: -3.6, near: 1, far: 14 });
  sun.shadow.normalBias = 0.012;
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 3;
  scene.add(ambient, sun);

  const background = new Color();
  function applyTheme(theme: RoomTheme) {
    const palette = ROOM_PALETTES[theme];
    materials.applyPalette(palette);
    background.set(palette.background);
    scene.background = background;
    ambient.intensity = palette.ambient;
    sun.intensity = palette.sun;
    sun.shadow.intensity = palette.shadow;
    model.setContactStrength(palette.contact);
  }
  applyTheme(options.theme);

  // --- カメラ ---
  let target: SectionId = options.section;
  let reducedMotion = options.reducedMotion;
  let aspect = 1;
  const position = new Vector3(...VIEWPOINTS[target].position);
  const lookAt = new Vector3(...VIEWPOINTS[target].lookAt);
  let fov = fitFov(VIEWPOINTS[target], aspect);

  let tween: {
    path: CatmullRomCurve3 | null;
    fromPosition: Vector3;
    toPosition: Vector3;
    fromLook: Vector3;
    toLook: Vector3;
    fromFov: number;
    elapsed: number;
    duration: number;
  } | null = null;

  function applyCamera() {
    camera.position.copy(position);
    camera.lookAt(lookAt);
    camera.fov = fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  function snapTo(section: SectionId) {
    tween = null;
    position.set(...VIEWPOINTS[section].position);
    lookAt.set(...VIEWPOINTS[section].lookAt);
    fov = fitFov(VIEWPOINTS[section], aspect);
  }

  function stepCamera(delta: number): boolean {
    if (!tween) {
      fov = fitFov(VIEWPOINTS[target], aspect);
      return false;
    }
    tween.elapsed += delta;
    const t = Math.min(tween.elapsed / tween.duration, 1);
    const e = easeInOut(t);
    if (tween.path) tween.path.getPoint(e, position);
    else position.lerpVectors(tween.fromPosition, tween.toPosition, e);
    lookAt.lerpVectors(tween.fromLook, tween.toLook, e);
    // リサイズと同時でも破綻しないよう、到達先の画角は毎フレーム求め直す
    const toFov = fitFov(VIEWPOINTS[target], aspect);
    fov = tween.fromFov + (toFov - tween.fromFov) * e;
    if (t >= 1) {
      tween = null;
      return false;
    }
    return true;
  }

  function focus(section: SectionId, { instant = false } = {}) {
    target = section;
    if (instant || reducedMotion) {
      snapTo(section);
      setPanelOpen(section === "pc");
      scheduler.invalidate();
      return;
    }
    const view = VIEWPOINTS[section];
    // 中断されたときも「今いる場所」から続ける
    const route = routeTo(toVec3(position), section);
    tween = {
      path:
        route.length > 2
          ? new CatmullRomCurve3(route.map((p) => new Vector3(...p)), false, "centripetal")
          : null,
      fromPosition: position.clone(),
      toPosition: new Vector3(...view.position),
      fromLook: lookAt.clone(),
      toLook: new Vector3(...view.lookAt),
      fromFov: fov,
      elapsed: 0,
      duration:
        route.length > 2
          ? ROOM_RENDER.relayTransitionSeconds
          : ROOM_RENDER.transitionSeconds,
    };
    setPanelOpen(section === "pc");
    scheduler.invalidate();
  }

  // --- 画面の表面 ---
  const scheduler = createRenderScheduler((delta) => {
    const moving = stepCamera(delta);
    const pressing = stepMovable(delta);
    applyCamera();
    renderer.render(scene, camera);
    return moving || pressing;
  });

  const screens = createScreens(
    model.screens,
    { iconUrl: options.iconUrl, buildLabel: options.buildLabel },
    scheduler.invalidate,
  );

  // --- 選択した部品の動き（キーを押す / 本を引き出す）---
  const movingParts = new Map<string, boolean>();
  function stepMovable(delta: number): boolean {
    let active = false;
    for (const [name, selected] of movingParts) {
      const part = model.movable.get(name);
      if (!part) continue;
      const goal = selected ? part.moved : part.home;
      const { position: current } = part.object;
      renderer.shadowMap.needsUpdate = true;
      if (reducedMotion) current.copy(goal);
      else current.lerp(goal, Math.min(delta * 14, 1));
      if (current.distanceToSquared(goal) < 1e-8) {
        current.copy(goal);
        movingParts.delete(name);
      } else {
        active = true;
      }
    }
    return active;
  }

  // --- 判定領域（見た目とは別の箱）---
  const hitGeometry = new BoxGeometry(1, 1, 1);
  const hitMaterial = new MeshBasicMaterial({
    color: "#ff00aa",
    wireframe: true,
    side: DoubleSide,
    visible: options.showHitAreas === true,
  });
  const hitRoot = new Group();
  hitRoot.name = "hit_areas";
  scene.add(hitRoot);
  model.root.updateMatrixWorld(true);

  function addHitArea(group: Group | Mesh, pick: RoomPick, padding: number): HitArea {
    const box = new Box3().setFromObject(group).expandByScalar(padding);
    const mesh = new Mesh(hitGeometry, hitMaterial);
    box.getCenter(mesh.position);
    box.getSize(mesh.scale);
    hitRoot.add(mesh);
    return { mesh, pick, group };
  }

  const findGroup = (name: string) =>
    model.root.getObjectByName(name) as Group | Mesh | undefined;

  const sectionHits: HitArea[] = [];
  for (const { section, groups, label } of SECTION_TARGETS) {
    for (const name of groups) {
      const group = findGroup(name);
      if (group) {
        sectionHits.push(addHitArea(group, { section, detail: null, label }, 0.03));
      }
    }
  }
  const detailHits: HitArea[] = [];
  for (const { id, section, group: name, label } of DETAIL_TARGETS) {
    const group = name ? findGroup(name) : undefined;
    if (group) {
      detailHits.push(addHitArea(group, { section, detail: id, label }, 0.008));
    }
  }

  // --- 強調表示 ---
  // ワイヤーフレームの代わりに、対象の材質だけをほんの少し光らせる。
  // 材質は共有なので、強調用の複製を作って差し替える
  const glowCopies = new Map<string, MeshLambertMaterial>();
  const originals = new Map<Mesh, Mesh["material"]>();
  const glowMaterial = (source: MeshLambertMaterial, strength: number) => {
    const key = `${source.uuid}:${strength}`;
    let copy = glowCopies.get(key);
    if (!copy) {
      copy = source.clone();
      copy.emissive.set("#22d3ee");
      copy.emissiveIntensity = strength;
      glowCopies.set(key, copy);
    }
    copy.color.copy(source.color);
    return copy;
  };
  let hoverGroup: Group | Mesh | null = null;
  let selectedGroup: Group | Mesh | null = null;
  function paintHighlights() {
    for (const [mesh, material] of originals) mesh.material = material;
    originals.clear();
    const paint = (group: Group | Mesh | null, strength: number) => {
      group?.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const material = originals.get(object) ?? object.material;
        if (!(material instanceof MeshLambertMaterial)) return;
        originals.set(object, material);
        object.material = glowMaterial(material, strength);
      });
    };
    paint(hoverGroup, 0.1);
    paint(selectedGroup, 0.24);
    scheduler.invalidate();
  }

  // --- 物を選ぶ ---
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const solids: Mesh[] = [];
  model.root.traverse((object) => {
    if (object instanceof Mesh) solids.push(object);
  });

  /** 画面上の点にある物。手前の家具に隠れていれば選ばない */
  function pickAt(clientX: number, clientY: number): RoomPick | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);

    const nearest = raycaster
      .intersectObjects(solids.filter(isVisibleInTree), false)
      .find((hit) => hit.object.name !== "contact_shadows");

    const test = (areas: HitArea[]) => {
      const candidates = areas
        .flatMap((area) => {
          const [hit] = raycaster.intersectObject(area.mesh, false);
          return hit ? [{ area, distance: hit.distance }] : [];
        })
        .sort((a, b) => a.distance - b.distance);
      return candidates.find(({ area, distance }) => {
        if (!nearest) return true;
        if (belongsTo(nearest.object as Mesh, area.group)) return true;
        // 判定の箱より手前に別の家具の面があれば、背面越しのクリックになる
        return nearest.distance >= distance - 0.005;
      })?.area.pick;
    };

    // 詳細モードでは部品を親のケースより優先する
    const details = detailHits.filter((area) => area.pick.section === target);
    return test(details) ?? test(sectionHits) ?? null;
  }

  function setHover(pick: RoomPick | null) {
    const area = pick
      ? [...detailHits, ...sectionHits].find(
          (hit) => hit.pick.label === pick.label && hit.pick.detail === pick.detail,
        )
      : undefined;
    const next = area?.group ?? null;
    if (next === hoverGroup) return;
    hoverGroup = next;
    paintHighlights();
  }

  // --- ポインタ ---
  const events = new AbortController();
  const { signal } = events;
  let downX = 0;
  let downY = 0;
  let downPointer = -1;
  let hoverFrame = 0;
  let hoverEvent: PointerEvent | null = null;

  canvas.addEventListener(
    "pointerdown",
    (event) => {
      downPointer = event.pointerId;
      downX = event.clientX;
      downY = event.clientY;
    },
    { signal },
  );
  canvas.addEventListener(
    "pointerup",
    (event) => {
      if (event.pointerId !== downPointer) return;
      downPointer = -1;
      // ドラッグやスクロールの指離れをクリック扱いしない
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 6) return;
      const pick = pickAt(event.clientX, event.clientY);
      if (pick) options.onPick(pick);
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch") return;
      hoverEvent = event;
      if (hoverFrame !== 0) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        if (!hoverEvent) return;
        const pick = pickAt(hoverEvent.clientX, hoverEvent.clientY);
        canvas.style.cursor = pick ? "pointer" : "";
        setHover(pick);
        options.onHover(pick, hoverEvent.clientX, hoverEvent.clientY);
      });
    },
    { signal },
  );
  canvas.addEventListener(
    "pointerleave",
    (event) => {
      hoverEvent = null;
      setHover(null);
      options.onHover(null, event.clientX, event.clientY);
    },
    { signal },
  );
  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      // 自動で復旧しない。静止画へ戻し、再読み込みは利用者に任せる
      event.preventDefault();
      options.onFailure("WebGL の描画が中断された");
    },
    { signal },
  );

  // --- サイズ・可視状態 ---
  function resize() {
    const { clientWidth: width, clientHeight: height } = host;
    if (width === 0 || height === 0) return;
    aspect = width / height;
    renderer.setSize(width, height, false);
    if (!tween) fov = fitFov(VIEWPOINTS[target], aspect);
    // 幅のアニメーション中に空の canvas が見えないよう、同じタイミングで描く
    scheduler.renderNow();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);

  let offscreen = false;
  const syncSuspended = () =>
    scheduler.setSuspended(document.hidden || offscreen);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    offscreen = !entry.isIntersecting;
    syncSuspended();
  });
  visibilityObserver.observe(host);
  document.addEventListener("visibilitychange", syncSuspended, { signal });

  // --- 細部 ---
  let panelOpen = false;
  function setPanelOpen(open: boolean) {
    panelOpen = open;
    const panel = model.root.getObjectByName("pc_side_panel");
    if (panel) panel.visible = !open;
    scheduler.invalidate();
  }

  let selectedDetail: string | null = null;
  function setDetail(
    detail: string | null,
    work?: { label: string; imageUrl?: string },
  ) {
    for (const previous of DETAIL_TARGETS) {
      if (previous.id === selectedDetail && previous.group) {
        movingParts.set(previous.group, false);
      }
    }
    if (selectedDetail && !detail) screens.showDefault();
    selectedDetail = detail;
    selectedGroup = null;

    const definition = DETAIL_TARGETS.find((item) => item.id === detail);
    if (definition?.group) {
      movingParts.set(definition.group, true);
      if (definition.section === "pc") setPanelOpen(true);
      selectedGroup = findGroup(definition.group) ?? null;
    }
    if (definition && !definition.group && work) {
      screens.showWork(work.label, work.imageUrl);
    }
    paintHighlights();
  }

  // 最初の 1 枚。resize の中で描くので host に入れてから測る
  host.appendChild(canvas);
  snapTo(target);
  setPanelOpen(target === "pc");
  resize();

  let disposed = false;
  return {
    focus,
    setDetail,
    setPanelOpen,
    get panelOpen() {
      return panelOpen;
    },
    setTheme(theme: RoomTheme) {
      applyTheme(theme);
      paintHighlights();
    },
    setReducedMotion(value: boolean) {
      reducedMotion = value;
      if (value) {
        snapTo(target);
        scheduler.invalidate();
      }
    },
    setPixelRatio(ratio: number) {
      renderer.setPixelRatio(Math.min(ratio, ROOM_RENDER.maxPixelRatio));
      resize();
    },
    /** 計測用（?debug のときだけ外から見える） */
    stats() {
      const { calls, triangles } = renderer.info.render;
      return {
        calls,
        triangles,
        renderCount: scheduler.renderCount,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        camera: toVec3(position),
        moving: tween !== null,
      };
    },
    /** 物の画面上の位置。offset は隠れた中心を避けて見える面を指すときに使う */
    projectGroup(name: string, offset: Vec3 = [0, 0, 0]) {
      const group = findGroup(name);
      if (!group) return null;
      const center = new Box3().setFromObject(group).getCenter(new Vector3());
      center.add(new Vector3(...offset)).project(camera);
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + ((center.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - center.y) / 2) * rect.height,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      events.abort(); // forceContextLoss の前に外す（失敗扱いにしないため）
      if (hoverFrame !== 0) cancelAnimationFrame(hoverFrame);
      scheduler.dispose();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      screens.dispose();
      model.dispose();
      hitGeometry.dispose();
      hitMaterial.dispose();
      glowCopies.forEach((material) => material.dispose());
      materials.dispose();
      scene.traverse((object) => {
        if (object instanceof Mesh) {
          const material = object.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

export type RoomScene = ReturnType<typeof assembleRoomScene>;
