import { defineComponent, h, type PropType } from "vue";
import { imageAttrs } from "../../media/runtime/image-attrs.ts";
import type { Image as ImageRead } from "../../schema/inference/data.ts";

/**
 * Renders a populated `image` field as an `<img>` with its `srcset`, dimensions and `alt`. Loads lazily unless
 * `loading` says otherwise. Pass `sizes` for the width it renders at. Renders nothing without an image.
 * @example
 * <Image :image="post.hero" sizes="(min-width: 720px) 720px, 100vw" />
 */
export const Image = defineComponent({
  name: "Image",
  inheritAttrs: false,
  props: { image: Object as PropType<Partial<ImageRead> | null> },
  setup(props, { attrs }) {
    return () => {
      const own = imageAttrs(props.image, attrs);
      return own ? h("img", own) : null;
    };
  },
});
