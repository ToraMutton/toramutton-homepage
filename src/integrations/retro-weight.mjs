// /retro/ 専用のビルド後処理。
//   1. 配信する HTML から、コメントと余分な空白を削る(ソース側は読みやすいまま)
//   2. 実際のファイルサイズを測って、ページの <!--retro-weight--> の位置に書き込む
// 開発サーバー(npm run dev)では動かないので、重さの表示はビルドした結果にだけ出る。
import { readFile, stat, writeFile } from "node:fs/promises";

const PAGE = "retro/index.html";
const MARK = "<!--retro-weight-->";

// \s は全角スペースや nbsp も詰めてしまうので使わない
const SPACES = /[ \t\r\n\f]+/g;

const slimCss = (css) =>
  css
    .replace(/\/\*.*?\*\//gs, "")
    .replace(SPACES, " ")
    .replace(/ ?([{};]) ?/g, "$1")
    .trim();

// <pre> や <script> があるページには使えない(空白に意味があるため)
const slimHtml = (html) =>
  html
    .replace(/<!--(?!retro-weight-->).*?-->/gs, "")
    .replace(/<style>(.*?)<\/style>/gs, (_, css) => `<style>${slimCss(css)}</style>`)
    .replace(SPACES, " ");

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} KB`;

export default function retroWeight() {
  let publicDir;

  return {
    name: "retro-weight",
    hooks: {
      "astro:config:done": ({ config }) => {
        publicDir = config.publicDir;
      },
      // ページを書き出した直後。Vercel アダプタが成果物をコピーするより前に書き換える
      "astro:build:generated": async ({ dir, logger }) => {
        const top = await stat(new URL("index.html", dir)).catch(() => null);

        const file = new URL(PAGE, dir);
        const html = slimHtml(await readFile(file, "utf8"));
        if (!html.includes(MARK)) {
          logger.warn(`${PAGE}: ${MARK} が見つかりません`);
        }

        let imageBytes = 0;
        for (const [, src] of html.matchAll(/<img [^>]*?src="\/([^"]+)"/g)) {
          imageBytes += (await stat(new URL(src, publicDir))).size;
        }
        const scripts = (html.match(/<script/g) ?? []).length;

        // 表示する文章の分だけページが重くなるので、数字が落ち着くまで作り直す
        let size = 0;
        let output = html;
        for (let i = 0; i < 5; i++) {
          const parts = [`このページ: ${kb(size)}`];
          if (imageBytes) parts.push(`画像: ${kb(imageBytes)}`);
          if (!scripts) parts.push("JavaScript: 0 KB");
          let text = parts.join(" ／ ");
          if (top && size) {
            text += `<br>最新版のトップ: ${kb(top.size)}`;
          }
          output = html.replace(MARK, text);
          const next = Buffer.byteLength(output);
          if (next === size) break;
          size = next;
        }

        await writeFile(file, output);
        logger.info(`${PAGE}: ${kb(Buffer.byteLength(output))}`);
      },
    },
  };
}
