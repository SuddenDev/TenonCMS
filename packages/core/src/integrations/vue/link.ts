import { defineComponent, type PropType } from "vue";
import type { LinkRead } from "../../links/config/types.ts";
import { linkAttrs } from "../../links/runtime/link-attrs.ts";
import { primitiveProps, renderPrimitive } from "./primitive.ts";

/**
 * Renders a populated `link` field. The default slot is the content, else the target's title. Renders nothing for a
 * broken or empty link. A component in `as`, like `RouterLink` or `NuxtLink`, gets internal paths as `to`; other
 * URLs render a plain `<a>`. `target="_blank"` adds `rel="noopener noreferrer"`.
 * @example
 * <Link :link="page.cta" :as="RouterLink" class="button" />
 */
export const Link = defineComponent({
  name: "Link",
  inheritAttrs: false,
  props: {
    link: Object as PropType<Partial<LinkRead> | null>,
    ...primitiveProps,
    as: { ...primitiveProps.as, default: "a" },
  },
  setup(props, { attrs, slots }) {
    return () => {
      const own = linkAttrs(props.link, typeof props.as !== "string");
      if (!own) return null;

      const as = "to" in own || typeof props.as === "string" ? props.as : "a";
      const content = props.asChild ? undefined : () => slots.default?.() ?? props.link?.title;
      return renderPrimitive(
        { as, asChild: props.asChild },
        { ...own, ...attrs },
        content,
        slots.default,
      );
    };
  },
});
