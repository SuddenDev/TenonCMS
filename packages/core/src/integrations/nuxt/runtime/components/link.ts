import { NuxtLink } from "#components";
import { Link } from "tenoncms/vue";
import { defineComponent, h } from "vue";

/** `Link` from `tenoncms/vue` with `NuxtLink` as `as`, so internal links navigate client-side and prefetch. */
export default defineComponent({
  name: "TenonLink",
  props: { ...Link.props, as: { ...Link.props.as, default: () => NuxtLink } },
  setup(props, { slots }) {
    return () => h(Link, props, slots);
  },
});
