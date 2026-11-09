// 「今どの章を見せるか」を決める唯一の場所。
//
// スクロール / ナビ / 3D の物 / ブラウザの戻る進む は全部 selectSection に入る。
// カメラや DOM は effects 経由で呼ぶだけなので、ブラウザなしでテストできる。
//
// 難しいのは「ナビを押した直後のスクロール」の扱い。アンカー移動の途中で検知した章に
// 反応するとカメラが寄り道するので、移動中はロックして scroll 由来の選択を無視する。
// ロックは時間では解かず、到達(settle) か 手動操作(interrupt) で解く。
import type { SectionId, SelectionSource } from "../../data/roomPrototype";

export interface NavigatorEffects {
  /** 章が変わった。DOM とカメラを更新する */
  applySection(id: SectionId, source: SelectionSource): void;
  /** 細部の選択が変わった（章が変わると null になる） */
  applyDetail(
    detail: string | null,
    section: SectionId,
    source: SelectionSource,
  ): void;
  /** 3D の物を選んだときに本文へ移動する。ナビはブラウザのアンカー移動に任せる */
  jumpToSection(id: SectionId): void;
  /** 読み進めて章が変わったときに URL を置き換える（履歴は増やさない） */
  replaceHash(id: SectionId): void;
}

export function createRoomNavigator(
  effects: NavigatorEffects,
  initial: SectionId,
  { locked: initiallyLocked = false } = {},
) {
  let active = initial;
  let detail: string | null = null;
  let locked = initiallyLocked;
  // ロック中も「今スクロールでどこにいるか」だけは覚えておく（手動割り込みで使う）
  let scrolledTo = initial;

  function selectSection(id: SectionId, source: SelectionSource) {
    if (source === "scroll") {
      scrolledTo = id;
      if (locked) return;
    } else {
      locked = true;
      if (source === "scene") effects.jumpToSection(id);
    }

    if (id === active) return;
    active = id;
    if (detail !== null) {
      detail = null;
      effects.applyDetail(null, id, source);
    }
    effects.applySection(id, source);
    if (source === "scroll") effects.replaceHash(id);
  }

  function selectDetail(
    section: SectionId,
    id: string,
    source: SelectionSource,
  ) {
    if (section !== active) selectSection(section, source);
    if (detail === id) return;
    detail = id;
    effects.applyDetail(id, section, source);
  }

  return {
    selectSection,
    selectDetail,
    /** アンカー移動が終わった。次の scroll からまた追従する */
    settle() {
      locked = false;
    },
    /** 移動中に利用者がスクロールした。読んでいる場所を正として追従に戻す */
    interrupt() {
      if (!locked) return;
      locked = false;
      selectSection(scrolledTo, "scroll");
    },
    get active() {
      return active;
    },
    get detail() {
      return detail;
    },
    get locked() {
      return locked;
    },
  };
}

export type RoomNavigator = ReturnType<typeof createRoomNavigator>;
