// /lab/room/ の入口。ここには Three.js を入れない。
//
// 流れ: 本文は HTML だけで読める → このファイルが移動の配線をする →
//       条件を満たしたときだけ scene を動的 import する。
// 3D が失敗しても本文とナビはそのまま動くよう、3D は「後付けの飾り」として扱う。
import { navigate } from "astro:transitions/client";
import {
  DETAIL_TARGETS,
  ROOM_SPLIT_MIN_WIDTH,
  SECTION_IDS,
  isSectionId,
  type RoomState,
  type RoomTheme,
  type SectionId,
  type StageStatus,
} from "../../data/roomPrototype";
import { createRoomNavigator } from "./navigation";
import type { RoomScene } from "./scene";

const STATIC_PREFERENCE_KEY = "room-prefer-static";

const readTheme = (): RoomTheme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

const readHashSection = (): SectionId | null => {
  const hash = location.hash.slice(1);
  return isSectionId(hash) ? hash : null;
};

function readStaticPreference() {
  try {
    return sessionStorage.getItem(STATIC_PREFERENCE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStaticPreference(value: boolean) {
  try {
    if (value) sessionStorage.setItem(STATIC_PREFERENCE_KEY, "1");
    else sessionStorage.removeItem(STATIC_PREFERENCE_KEY);
  } catch {
    // 保存できなくても、このページの間は動く
  }
}

/** 通信量を抑える設定の端末では、広い画面でも自動で 3D を読まない */
const prefersDataSaving = () => {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
};

function mount(app: HTMLElement) {
  const events = new AbortController();
  const { signal } = events;
  const params = new URLSearchParams(location.search);
  const debug = params.get("debug");

  const host = app.querySelector<HTMLElement>("[data-room-host]")!;
  const statusText = app.querySelector<HTMLElement>("[data-room-status]")!;
  const toggle3d = app.querySelector<HTMLButtonElement>("[data-room-toggle3d]")!;
  const tooltip = app.querySelector<HTMLElement>("[data-room-tooltip]")!;
  const selectedLabel = app.querySelector<HTMLElement>("[data-room-selected]")!;
  const panelButton = app.querySelector<HTMLButtonElement>("[data-room-panel]");
  const sections = SECTION_IDS.map((id) => document.getElementById(id)!);

  const wideQuery = window.matchMedia(`(min-width: ${ROOM_SPLIT_MIN_WIDTH}px)`);
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const hashSection = readHashSection();
  const state: RoomState = {
    activeSection: hashSection ?? "home",
    selectedDetail: null,
    stageStatus: "static",
    theme: readTheme(),
    reducedMotion: motionQuery.matches,
  };

  let scene: RoomScene | null = null;
  /** 3D の読み込みごとに増やす。古い読み込みの結果を捨てるための番号 */
  let generation = 0;
  let requestedByUser = false;
  let preferStatic = readStaticPreference();
  let settleTimer = 0;

  // --- DOM への反映 ---
  function renderSectionDom(id: SectionId) {
    state.activeSection = id;
    app.dataset.section = id;
    for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-room-link]")) {
      if (link.dataset.roomLink === id) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
  }

  function renderDetailDom(detail: string | null) {
    state.selectedDetail = detail;
    const chosen = detail
      ? app.querySelector<HTMLElement>(`[data-room-detail="${detail}"]`)
      : null;
    selectedLabel.hidden = chosen === null;
    selectedLabel.textContent = chosen?.dataset.label ?? "";
    for (const button of app.querySelectorAll<HTMLButtonElement>("[data-room-detail]")) {
      button.setAttribute("aria-pressed", String(button.dataset.roomDetail === detail));
    }
    for (const panel of app.querySelectorAll<HTMLElement>("[data-room-detail-panel]")) {
      panel.classList.toggle("is-active", panel.dataset.roomDetailPanel === detail);
    }
  }

  function renderPanelButton() {
    if (!panelButton) return;
    const open = scene?.panelOpen ?? false;
    panelButton.textContent = open ? "側板を閉じる" : "側板を開く";
    panelButton.disabled = scene === null;
  }

  const STATUS_LABELS: Record<StageStatus, string> = {
    static: "静止画を表示中",
    loading: "3D を読み込み中…",
    ready: "3D を表示中",
    error: "3D を表示できませんでした。本文はそのまま読めます",
  };
  const TOGGLE_LABELS: Record<StageStatus, string> = {
    static: "3Dで眺める",
    loading: "通常表示",
    ready: "通常表示",
    error: "もう一度読み込む",
  };

  function setStatus(status: StageStatus) {
    state.stageStatus = status;
    app.dataset.stage = status;
    statusText.textContent = STATUS_LABELS[status];
    toggle3d.textContent = TOGGLE_LABELS[status];
    renderPanelButton();
  }

  // --- 3D の読み込みと破棄 ---
  async function start3d() {
    const mine = ++generation;
    setStatus("loading");
    try {
      const { createRoomScene } = await import("./scene");
      if (mine !== generation) return; // 待っている間に停止・離脱・幅の変更があった
      const created = createRoomScene({
        host,
        section: state.activeSection,
        theme: state.theme,
        reducedMotion: state.reducedMotion,
        iconUrl: app.dataset.iconUrl,
        buildLabel: app.dataset.buildLabel ?? "",
        showHitAreas: debug === "hits",
        onPick(pick) {
          if (pick.detail) room.selectDetail(pick.section, pick.detail, "scene");
          else room.selectSection(pick.section, "scene");
          armSettle();
        },
        onHover(pick, x, y) {
          tooltip.hidden = pick === null;
          if (!pick) return;
          tooltip.textContent = pick.label;
          const bounds = app.querySelector(".room-stage")!.getBoundingClientRect();
          tooltip.style.transform = `translate(${x - bounds.left + 14}px, ${y - bounds.top + 14}px)`;
        },
        onFailure(reason) {
          fail(mine, reason);
        },
      });
      scene = created;
      if (state.selectedDetail) applySceneDetail(state.selectedDetail);
      setStatus("ready");
      if (debug !== null) exposeDebug();
    } catch (error) {
      fail(mine, error);
    }
  }

  function fail(from: number, reason: unknown) {
    if (from !== generation) return;
    console.error("[room] 3D を表示できない:", reason);
    stop3d("error");
  }

  function stop3d(status: StageStatus = "static") {
    generation += 1;
    scene?.dispose();
    scene = null;
    tooltip.hidden = true;
    setStatus(status);
  }

  /** 画面幅と利用者の選択から、3D を動かすべきか判断する */
  function reconcile3d() {
    if (preferStatic || state.stageStatus === "error") return;
    const shouldRun = wideQuery.matches
      ? requestedByUser || !prefersDataSaving()
      : requestedByUser;
    const running = state.stageStatus === "ready" || state.stageStatus === "loading";
    if (shouldRun && !running) void start3d();
    else if (!shouldRun && running) stop3d();
  }

  function exposeDebug() {
    (window as Window & { __roomDebug?: unknown }).__roomDebug = {
      state,
      scene: () => scene,
      generation: () => generation,
      navigator: room,
    };
  }

  function applySceneDetail(detail: string | null) {
    if (!scene) return;
    const button = detail
      ? app.querySelector<HTMLElement>(`[data-room-detail="${detail}"]`)
      : null;
    scene.setDetail(detail, {
      label: button?.dataset.label ?? "",
      imageUrl: button?.dataset.image,
    });
    renderPanelButton();
  }

  // --- 章の選択 ---
  const room = createRoomNavigator(
    {
      applySection(id) {
        renderSectionDom(id);
        scene?.focus(id);
        renderPanelButton();
      },
      applyDetail(detail, _section, source) {
        renderDetailDom(detail);
        applySceneDetail(detail);
        if (detail && source === "scene") {
          app
            .querySelector(`[data-room-detail-panel="${detail}"]`)
            ?.scrollIntoView({ block: "nearest" });
        }
      },
      jumpToSection(id) {
        void navigate(`#${id}`);
      },
      replaceHash(id) {
        history.replaceState(history.state, "", `#${id}`);
      },
    },
    state.activeSection,
    { locked: hashSection !== null },
  );

  /** スクロールが止まったらロックを解く。動いている間は待ち続ける */
  function armSettle() {
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => room.settle(), 180);
  }

  // --- 読み進めた位置の検知 ---
  const inView = new Set<SectionId>();
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = entry.target.id as SectionId;
        if (entry.isIntersecting) inView.add(id);
        else inView.delete(id);
      }
      const current = SECTION_IDS.findLast((id) => inView.has(id));
      if (current) room.selectSection(current, "scroll");
    },
    // 画面の縦 55% 付近の線をまたいだ章を「読んでいる章」とする
    { rootMargin: "-55% 0px -44% 0px" },
  );
  sections.forEach((section) => spy.observe(section));

  window.addEventListener(
    "scroll",
    () => {
      if (room.locked) armSettle();
    },
    { passive: true, signal },
  );
  window.addEventListener("scrollend", () => room.settle(), { signal });

  const interrupt = () => room.interrupt();
  window.addEventListener("wheel", interrupt, { passive: true, signal });
  window.addEventListener("touchmove", interrupt, { passive: true, signal });
  window.addEventListener(
    "keydown",
    (event) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
        room.interrupt();
      }
    },
    { signal },
  );

  // --- 戻る / 進む（router が URL とスクロールを復元した後に章を合わせる）---
  const syncFromHistory = () => {
    const id = readHashSection() ?? "home";
    if (id === room.active) return;
    room.selectSection(id, "history");
    armSettle();
  };
  window.addEventListener("popstate", syncFromHistory, { signal });
  window.addEventListener("hashchange", syncFromHistory, { signal });

  // --- クリック ---
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element;
      // リンク自体の移動は ClientRouter の通常アンカーに任せる
      const link = target.closest<HTMLAnchorElement>("[data-room-link]");
      if (link && isSectionId(link.dataset.roomLink ?? "")) {
        room.selectSection(link.dataset.roomLink as SectionId, "nav");
        armSettle();
        return;
      }
      const detail = target.closest<HTMLElement>("[data-room-detail]");
      if (detail) {
        const definition = DETAIL_TARGETS.find((item) => item.id === detail.dataset.roomDetail);
        if (definition) {
          room.selectDetail(definition.section, definition.id, "nav");
          armSettle();
        }
        return;
      }
      if (target.closest("[data-room-panel]")) {
        scene?.setPanelOpen(!scene.panelOpen);
        renderPanelButton();
        return;
      }
      if (target.closest("[data-room-toggle3d]")) {
        if (state.stageStatus === "ready" || state.stageStatus === "loading") {
          preferStatic = true;
          requestedByUser = false;
          writeStaticPreference(true);
          stop3d();
        } else {
          preferStatic = false;
          requestedByUser = true;
          writeStaticPreference(false);
          void start3d();
        }
        return;
      }
      if (target.closest("#room-theme-toggle")) {
        const dark = document.documentElement.classList.toggle("dark");
        localStorage.setItem("theme", dark ? "dark" : "light");
      }
    },
    { signal },
  );

  // --- テーマ・動き・画面幅の変化 ---
  const themeObserver = new MutationObserver(() => {
    const theme = readTheme();
    if (theme === state.theme) return;
    state.theme = theme;
    scene?.setTheme(theme);
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  motionQuery.addEventListener(
    "change",
    (event) => {
      state.reducedMotion = event.matches;
      scene?.setReducedMotion(event.matches);
    },
    { signal },
  );
  wideQuery.addEventListener("change", reconcile3d, { signal });

  // --- 開始 ---
  renderSectionDom(state.activeSection);
  renderDetailDom(null);
  setStatus("static");
  if (hashSection) armSettle();
  if (debug !== null) exposeDebug();
  reconcile3d();

  return () => {
    events.abort();
    clearTimeout(settleTimer);
    spy.disconnect();
    themeObserver.disconnect();
    stop3d();
  };
}

// 別ページへ移って戻ると DOM は新しくなるが、このモジュールは再実行されない。
// だから初期化はイベントで行い、破棄も同じ場所で対にする。
let unmount: (() => void) | null = null;

function init() {
  if (unmount) return;
  const app = document.getElementById("room-app");
  if (app) unmount = mount(app);
}

function destroy() {
  unmount?.();
  unmount = null;
}

document.addEventListener("astro:page-load", init);
document.addEventListener("astro:before-swap", destroy);
init();
