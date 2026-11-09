// /lab/room/ の章選択の振る舞いを確かめる。カメラや DOM を使わず状態遷移だけを見る。
import assert from "node:assert/strict";
import test from "node:test";
import { createRoomNavigator } from "../src/scripts/room/navigation.ts";

function setup(initial = "home", options) {
  const log = { sections: [], details: [], jumps: [], hashes: [] };
  const room = createRoomNavigator(
    {
      applySection: (id, source) => log.sections.push([id, source]),
      applyDetail: (detail) => log.details.push(detail),
      jumpToSection: (id) => log.jumps.push(id),
      replaceHash: (id) => log.hashes.push(id),
    },
    initial,
    options,
  );
  return { room, log };
}

test("読み進めた章に追従し、URL は置き換えだけで済ませる", () => {
  const { room, log } = setup();
  room.selectSection("about", "scroll");
  assert.equal(room.active, "about");
  assert.deepEqual(log.hashes, ["about"]);
});

test("ナビの移動中は途中の章を通っても視点を変えない", () => {
  const { room, log } = setup();
  room.selectSection("pc", "nav");
  room.selectSection("works", "scroll");
  room.selectSection("skills", "scroll");
  assert.equal(room.active, "pc");
  assert.deepEqual(log.sections, [["pc", "nav"]]);
  assert.deepEqual(log.hashes, []);
});

test("連打すると最後の選択が残る", () => {
  const { room } = setup();
  for (const id of ["about", "pc", "works", "library"]) {
    room.selectSection(id, "nav");
  }
  assert.equal(room.active, "library");
});

test("移動が終われば次のスクロールへ追従する", () => {
  const { room } = setup();
  room.selectSection("works", "nav");
  room.settle();
  room.selectSection("skills", "scroll");
  assert.equal(room.active, "skills");
});

test("移動中に手動で動かしたら、読んでいる場所へ合わせる", () => {
  const { room, log } = setup();
  room.selectSection("pc", "nav");
  room.selectSection("skills", "scroll");
  room.interrupt();
  assert.equal(room.active, "skills");
  assert.deepEqual(log.hashes, ["skills"]);
});

test("ロックしていないときの手動操作は何も変えない", () => {
  const { room, log } = setup("about");
  room.interrupt();
  assert.equal(room.active, "about");
  assert.deepEqual(log.sections, []);
});

test("章が変わると細部の選択を解除する", () => {
  const { room, log } = setup("pc");
  room.selectDetail("pc", "gpu", "nav");
  room.settle();
  room.selectSection("works", "scroll");
  assert.equal(room.detail, null);
  assert.deepEqual(log.details, ["gpu", null]);
});

test("別の章の細部を選ぶと、章ごと移動する", () => {
  const { room, log } = setup();
  room.selectDetail("skills", "rust", "scene");
  assert.equal(room.active, "skills");
  assert.equal(room.detail, "rust");
  assert.deepEqual(log.jumps, ["skills"]);
});

test("戻る/進むでは本文移動を二重に行わない", () => {
  const { room, log } = setup("works");
  room.selectSection("about", "history");
  assert.equal(room.active, "about");
  assert.deepEqual(log.jumps, []);
  assert.deepEqual(log.hashes, []);
});

test("#pc で開いたときは、読み込み直後の検知で全景へ戻らない", () => {
  const { room } = setup("pc", { locked: true });
  room.selectSection("home", "scroll");
  assert.equal(room.active, "pc");
});
