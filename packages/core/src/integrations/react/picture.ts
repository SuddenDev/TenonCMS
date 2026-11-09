import { createElement } from "react";
import { type PictureSource, pictureAttrs } from "../../media/runtime/image-attrs.ts";
import type { ImageProps } from "./image.ts";

export type PictureProps = ImageProps & { sources?: readonly PictureSource[] };

/**
 * Renders a `<picture>` that shows another image where a source's `media` matches, else `image`. Props go on the
 * `<img>`, as with `Image`. Renders nothing without `image`.
 * @example
 * <Picture image={page.hero} sources={[{ media: "(max-width: 600px)", image: page.heroMobile }]} sizes="100vw" />
 */
export function Picture({ image, sources, ...attrs }: PictureProps) {
  const own = pictureAttrs(image, sources, attrs);
  if (!own) return null;

  const { srcset, ...img } = own.img;
  return createElement(
    "picture",
    null,
    ...own.sources.map(({ srcset, ...source }, index) =>
      createElement("source", { key: index, ...source, srcSet: srcset }),
    ),
    createElement("img", { key: "img", ...img, srcSet: srcset }),
  );
}
