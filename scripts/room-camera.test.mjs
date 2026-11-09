// カメラの移動経路が家具を突き抜けないことを確かめる。
// 配置や視点を変えたらこのテストで検知できる（値そのものは見ていない）。
import assert from "node:assert/strict";
import test from "node:test";
import { CatmullRomCurve3, Vector3 } from "three";
import {
  ROOM_LAYOUT,
  SECTION_IDS,
  VIEWPOINTS,
  routeTo,
} from "../src/data/roomPrototype.ts";

const SOLIDS = ["deskTop", "chair", "pcCase", "bookshelf", "monitorMain", "monitorSub", "keyboard"];

function collide([x, y, z]) {
  return SOLIDS.find((name) => {
    const { position, size } = ROOM_LAYOUT[name];
    return [x, y, z].every((value, axis) => Math.abs(value - position[axis]) < size[axis] / 2);
  });
}

function sample(route) {
  if (route.length === 2) {
    const [from, to] = route.map((p) => new Vector3(...p));
    return Array.from({ length: 121 }, (_, i) => from.clone().lerp(to, i / 120));
  }
  // scene.ts と同じ曲線で調べる
  return new CatmullRomCurve3(route.map((p) => new Vector3(...p)), false, "centripetal").getPoints(120);
}

for (const from of SECTION_IDS) {
  for (const to of SECTION_IDS) {
    if (from === to) continue;
    test(`${from} → ${to} の経路は家具に当たらない`, () => {
      for (const point of sample(routeTo(VIEWPOINTS[from].position, to))) {
        const hit = collide(point.toArray());
        assert.equal(hit, undefined, `${hit} に衝突: ${point.toArray().map((n) => n.toFixed(2))}`);
      }
    });
  }
}

test("各視点は家具の中に置かれていない", () => {
  for (const id of SECTION_IDS) {
    assert.equal(collide(VIEWPOINTS[id].position), undefined, id);
  }
});

test("移動の途中で割り込まれた地点からも家具に当たらない", () => {
  for (const from of SECTION_IDS) {
    for (const via of SECTION_IDS) {
      if (from === via) continue;
      const points = sample(routeTo(VIEWPOINTS[from].position, via));
      for (const stop of [20, 50, 80, 110]) {
        for (const to of SECTION_IDS) {
          for (const point of sample(routeTo(points[stop].toArray(), to))) {
            const hit = collide(point.toArray());
            assert.equal(hit, undefined, `${from}→${via}@${stop}→${to}: ${hit}`);
          }
        }
      }
    }
  }
});
