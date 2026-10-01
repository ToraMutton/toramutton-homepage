export const ARTICLE_IMAGE_WIDTHS = [320, 480, 640, 960, 1280, 1440];
export const ARTICLE_IMAGE_SIZES = '(min-width: 720px) 720px, 100vw';

/** 本文のローカル画像だけを、記事幅と Retina 表示に合わせて生成する。 */
export default function responsiveMarkdownImages() {
  return (tree, file) => {
    const localImages = new Set(file.data.astro?.localImagePaths ?? []);

    const visit = (node) => {
      if (
        node.tagName === 'img' &&
        typeof node.properties?.src === 'string' &&
        localImages.has(decodeURI(node.properties.src))
      ) {
        node.properties.widths ??= ARTICLE_IMAGE_WIDTHS;
        node.properties.sizes ??= ARTICLE_IMAGE_SIZES;
      }
      node.children?.forEach(visit);
    };

    visit(tree);
  };
}
