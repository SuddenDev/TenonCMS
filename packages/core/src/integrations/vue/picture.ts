import { defineComponent, h, type PropType } from "vue";
import { type PictureSource, pictureAttrs } from "../../media/runtime/image-attrs.ts";
import type { Image as ImageRead } from "../../schema/inference/data.ts";

/**
 * Renders a `<picture>` that shows another image where a source's `media` matches, else `image`. Attributes go on the
 * `<img>`, as with `Image`. Renders nothing without `image`.
 * @example
 * <Picture :image="page.hero" :sources="[{ media: '(max-width: 600px)', image: page.heroMobile }]" sizes="100vw" />
 */
export const Picture = defineComponent({
  name: "Picture",
  inheritAttrs: false,
  props: {
    image: Object as PropType<Partial<ImageRead> | null>,
    sources: Array as PropType<readonly PictureSource[]>,
  },
  setup(props, { attrs }) {
    return () => {
      const own = pictureAttrs(props.image, props.sources, attrs);
      if (!own) return null;
      return h("picture", [...own.sources.map((source) => h("source", source)), h("img", own.img)]);
    };
  },
});
