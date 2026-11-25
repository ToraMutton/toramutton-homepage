// 記事のいいね。記事ページは静的なまま、表示したあとにブラウザがここを呼ぶ。
//   GET    … 今の数
//   POST   … 1 増やす
//   DELETE … 1 減らす(取り消し)
// 応答は { enabled, count }。enabled が false なら、画面はボタンを隠す。
//
// 別のサイトからの書き込みは、Astro の既定の Origin チェックと、
// ブラウザの CORS(このルートは許可を返さない)で弾かれる。
export const prerender = false;

import type { APIRoute } from "astro";
import { addLike, getLikes, likesEnabled } from "../../../utils/likes-store";
import { getVisiblePosts } from "../../../utils/post";

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function handle(delta?: 1 | -1): APIRoute {
  return async ({ params }) => {
    if (!likesEnabled()) return json({ enabled: false });

    // 公開されている記事だけ受け付ける(適当な名前でデータが増えないように)
    const slug = params.slug ?? "";
    if (!(await getVisiblePosts()).some((post) => post.id === slug)) return json({ error: "not found" }, 404);

    try {
      const count = delta ? await addLike(slug, delta) : await getLikes(slug);
      return json({ enabled: true, count });
    } catch (error) {
      console.error("likes:", error);
      return json({ error: "unavailable" }, 503);
    }
  };
}

export const GET = handle();
export const POST = handle(1);
export const DELETE = handle(-1);
