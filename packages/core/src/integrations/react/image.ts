import { createElement, type ImgHTMLAttributes } from "react";
import { imageAttrs } from "../../media/runtime/image-attrs.ts";
import type { Image as ImageRead } from "../../schema/inference/data.ts";

export type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & {
  image?: Partial<ImageRead> | null;
  [data: `data-${string}`]: unknown;
};

/**
 * Renders a populated `image` field as an `<img>` with its `srcset`, dimensions and `alt`. Loads lazily unless
 * `loading` says otherwise. Pass `sizes` for the width it renders at. Renders nothing without an image.
 * @example
 * <Image image={post.hero} sizes="(min-width: 720px) 720px, 100vw" />
 */
export function Image({ image, ...attrs }: ImageProps) {
  const own = imageAttrs(image, attrs);
  if (!own) return null;
  const { srcset, ...rest } = own;
  return createElement("img", { ...rest, srcSet: srcset });
}
