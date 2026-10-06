const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const VIDEO_ID = /^[\w-]{11}$/;

function parseTimestamp(value) {
  if (!value) return 0;

  let seconds;
  if (/^\d+$/.test(value)) {
    seconds = Number(value);
  } else {
    const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
    if (!match) return 0;
    seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  }

  return Number.isSafeInteger(seconds) ? seconds : 0;
}

function getVideoUrls(source) {
  if (!/^https?:\/\/\S+$/i.test(source)) return;

  let url;
  try {
    url = new URL(source);
  } catch {
    return;
  }
  if (url.username || url.password || url.port) return;

  let id;
  if (url.hostname === 'youtu.be') {
    id = url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1];
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    id = url.pathname === '/watch'
      ? url.searchParams.get('v')
      : url.pathname.match(/^\/shorts\/([\w-]{11})\/?$/)?.[1];
  }
  if (!id || !VIDEO_ID.test(id)) return;

  const start = parseTimestamp(
    url.searchParams.get('start') ?? url.searchParams.get('t') ??
      new URLSearchParams(url.hash.slice(1)).get('t'),
  );
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
  const watch = new URL(`https://www.youtube.com/watch?v=${id}`);
  if (start > 0) {
    embed.searchParams.set('start', String(start));
    watch.searchParams.set('t', String(start));
  }

  return { embed: embed.href, watch: watch.href };
}

/** 本文の単独 YouTube URL を、リンクカードに変換される前に埋め込む。 */
export default function youtubeEmbeds() {
  return (tree, file) => {
    const source = file.toString();

    // 本文直下だけを対象にし、引用・リスト・コード内の URL はそのままにする。
    for (const node of tree.children) {
      if (node.type !== 'paragraph') continue;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) continue;

      // 元の記法を確認し、[リンク](URL) や <URL> と裸の URL を区別する。
      const urls = getVideoUrls(source.slice(start, end).trim());
      if (!urls) continue;

      // hChildren で HTML を生成するため、Markdown / MDX の両方で使える。
      // data のある段落は remark-link-card が処理しない。
      node.data = {
        ...node.data,
        hName: 'div',
        hProperties: { className: ['youtube-embed'] },
        hChildren: [
          {
            type: 'element',
            tagName: 'iframe',
            properties: {
              src: urls.embed,
              title: 'YouTube動画プレイヤー',
              width: 720,
              height: 405,
              loading: 'lazy',
              referrerPolicy: 'strict-origin-when-cross-origin',
              allow: 'encrypted-media; picture-in-picture; web-share',
              allowFullScreen: true,
            },
            children: [],
          },
          {
            type: 'element',
            tagName: 'a',
            properties: {
              href: urls.watch,
              className: ['youtube-embed-link'],
              target: '_blank',
              rel: ['noopener', 'noreferrer'],
            },
            children: [{ type: 'text', value: 'YouTubeで見る' }],
          },
        ],
      };
    }
  };
}
