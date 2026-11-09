import type { Image } from "../../schema/inference/data.ts";

/**
 * The `<img>` attributes of a populated `image` field, merged with `attrs`, which win. Loads lazily by default. With
 * a `data-cms` attribute, the live preview also patches `src`, `srcset` and `alt`.
 * @returns `undefined` without an image.
 */
export function imageAttrs(
  image: Partial<Image> | null | undefined,
  attrs: Record<string, unknown> = {},
) {
  if (!image?.src) return undefined;

  return {
    src: image.src,
    srcset: image.srcset || undefined,
    width: image.width,
    height: image.height,
    alt: image.alt ?? "",
    loading: "lazy",
    decoding: "async",
    ...(attrs["data-cms"] ? { "data-cms-attr": "src,srcset,alt" } : {}),
    ...attrs,
  };
}

/** A `<source>` of a `<picture>`: the image to show where `media` matches. `sizes` defaults to the `<img>`'s. */
export type PictureSource = {
  image: Partial<Image> | null | undefined;
  media?: string;
  sizes?: string;
  type?: string;
};

/**
 * The attributes of a `<picture>`: one `<source>` per source with an image, then the `<img>` of {@link imageAttrs}.
 * A source without variants offers its original.
 * @returns `undefined` without the main image.
 */
export function pictureAttrs(
  image: Partial<Image> | null | undefined,
  sources: readonly PictureSource[] = [],
  attrs: Record<string, unknown> = {},
) {
  const img = imageAttrs(image, attrs);
  if (!img) return undefined;

  const sizes = attrs.sizes as string | undefined;
  return {
    sources: sources.flatMap(({ image, ...source }) =>
      image?.src
        ? [
            {
              srcset: image.srcset || image.src,
              sizes,
              width: image.width,
              height: image.height,
              ...source,
            },
          ]
        : [],
    ),
    img,
  };
}
