import { defineComponent, type PropType } from "vue";
import { renderRichtext, type RichtextProps } from "../../richtext/runtime/render.ts";
import { primitiveProps, renderPrimitive } from "./primitive.ts";

export type { RichtextProps } from "../../richtext/runtime/render.ts";

/** Renders reactive rich text into an unstyled `as` element (a `div`), or its child with `asChild`, during SSR too. */
export const Richtext = defineComponent({
  name: "Richtext",
  inheritAttrs: false,
  props: {
    content: Object as PropType<RichtextProps["content"]>,
    extensions: Object as PropType<RichtextProps["extensions"]>,
    ...primitiveProps,
  },
  setup(props, { attrs, slots }) {
    return () =>
      renderPrimitive(
        props,
        { ...attrs, innerHTML: renderRichtext(props.content, props.extensions) },
        undefined,
        slots.default,
      );
  },
});
