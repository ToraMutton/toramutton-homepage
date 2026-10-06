# ToraMutton's Homepage
 トラマトの学習記録や趣味などをまとめる予定のサイトです。/ A site for archiving ToraMutton's study logs and hobbies.

## 記事への YouTube 動画の追加

記事の本文に、空行で区切って YouTube の URL だけを書くと、プレイヤーが表示される。
Markdown / MDX の両方に対応し、自動再生はせず、プレイヤーは遅延読み込みする。

```md
作品のデモです。

https://youtu.be/M7lc1UVf-VE

操作方法を説明します。
```

- 対応 URL は `https://www.youtube.com/watch?v=動画ID`、`https://youtu.be/動画ID`、`https://www.youtube.com/shorts/動画ID`。モバイル用の `m.youtube.com` も使える。
- `?t=90`、`?t=1m30s`、`?start=90` の開始時刻を引き継ぐ。共有用の `si` や再生リスト指定は引き継がず、単体の動画として表示する。
- 通常のリンクにしたい場合は `[動画を見る](URL)` と書く。文中・引用・リスト・コード内の URL は埋め込まない。
- 限定公開動画も、YouTube 側で埋め込みが許可されていれば視聴できる。公開記事に載せた動画は、記事の訪問者も視聴できる。
- プレイヤーの下に「YouTubeで見る」リンクを表示する。非公開・埋め込み禁止・年齢制限などでサイト内で視聴できない場合も、このリンクから YouTube を開ける。

変換処理は `src/utils/remark-youtube-embed.mjs`。YouTube の情報取得や API キーは不要。

## 画像の追加・更新

- 共通画像は `src/assets/` の用途別フォルダ（`profile/`、`desktop/`、`works/`）に置く。
- 記事専用の画像は `src/content/blog/<記事名>/images/` に置き、記事から `./images/...` で参照する。画像が多ければ、その中を `parts/` などに分ける。
- ファイルの拡張子は実際の形式に合わせる。写真は JPEG / WebP、文字や図を含む画像は PNG / 可逆 WebP を使う。
- `public/icons/` と `public/favicons/` は固定 URL で配信する小さな画像用。圧縮されず、そのまま公開される。

プロフィール画像の元ファイルは `src/assets/profile/toramutton.jpg`。表示用画像・favicon・SNS用画像は Astro が生成する。差し替えたら `npm run ascii` で ASCII アートも更新する。

表示する画像には用途に合った幅と `sizes` を指定する。記事本文の候補幅と `sizes` は `src/utils/rehype-responsive-images.mjs` にまとめてあり、Markdown と `ImageCaption` の両方から使う。記事先頭の画像は優先して読み込み、本文や一覧の画像は遅延読み込みにする。
