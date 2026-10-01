# ToraMutton's Homepage
 トラマトの学習記録や趣味などをまとめる予定のサイトです。/ A site for archiving ToraMutton's study logs and hobbies.

## 画像の追加・更新

- 共通画像は `src/assets/` の用途別フォルダ（`profile/`、`desktop/`、`works/`）に置く。
- 記事専用の画像は `src/content/blog/<記事名>/images/` に置き、記事から `./images/...` で参照する。画像が多ければ、その中を `parts/` などに分ける。
- ファイルの拡張子は実際の形式に合わせる。写真は JPEG / WebP、文字や図を含む画像は PNG / 可逆 WebP を使う。
- `public/icons/` と `public/favicons/` は固定 URL で配信する小さな画像用。圧縮されず、そのまま公開される。

プロフィール画像の元ファイルは `src/assets/profile/toramutton.jpg`。表示用画像・favicon・SNS用画像は Astro が生成する。差し替えたら `npm run ascii` で ASCII アートも更新する。

表示する画像には用途に合った幅と `sizes` を指定する。記事本文の候補幅と `sizes` は `src/utils/rehype-responsive-images.mjs` にまとめてあり、Markdown と `ImageCaption` の両方から使う。記事先頭の画像は優先して読み込み、本文や一覧の画像は遅延読み込みにする。
