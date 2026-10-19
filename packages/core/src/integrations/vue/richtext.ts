import { defineComponent, h, type PropType } from "vue";
import { renderRichtext, type RichtextProps } from "../../richtext/runtime/render.ts";

export type { RichtextProps } from "../../richtext/runtime/render.ts";

/** Renders reactive rich text in an unstyled div, including during SSR. */
export const Richtext = defineComponent({
  name: "Richtext",
  props: {
    content: Object as PropType<RichtextProps["content"]>,
    extensions: Object as PropType<RichtextProps["extensions"]>,
  },
  setup(props) {
    return () => h("div", { innerHTML: renderRichtext(props.content, props.extensions) });
  },
});
