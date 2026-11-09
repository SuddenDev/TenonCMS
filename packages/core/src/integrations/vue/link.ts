import { defineComponent, type PropType } from "vue";
import type { LinkRead } from "../../links/config/types.ts";
import { primitiveProps, renderPrimitive } from "./primitive.ts";

// A path on this site, which a router component MAY handle. URLs, `//host`, `mailto:` and `#hash` stay plain.
const isInternal = (href: string) => href.startsWith("/") && !href.startsWith("//");

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
      const { href, target, title } = props.link ?? {};
      if (!href) return null;

      const router = typeof props.as !== "string" && isInternal(href);
      const own = {
        ...(router ? { to: href } : { href }),
        ...(target && target !== "_self" && { target }),
        ...(target === "_blank" && { rel: "noopener noreferrer" }),
        ...attrs,
      };
      const as = router || props.asChild ? props.as : typeof props.as === "string" ? props.as : "a";

      return renderPrimitive(
        { as, asChild: props.asChild },
        own,
        () => slots.default?.() ?? title,
        slots.default,
      );
    };
  },
});
