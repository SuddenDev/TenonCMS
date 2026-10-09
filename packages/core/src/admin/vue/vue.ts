import { createApp, h, reactive, Suspense, type Component } from "vue";
import type { Mount } from "../index";

export type { FieldContext, IntegralContext, Mount, PageContext } from "../index";

/**
 * Turns a Vue component into a {@link Mount}.
 *
 * The context arrives as props and stays reactive: watch `params.id` to refetch on route changes.
 * The component runs in its own Vue app inside `<Suspense>`, so top-level `await` works.
 * @example
 * // stats.ts, registered with clientRef('./stats.ts#mountStats')
 * export const mountStats = renderVue(Stats)
 *
 * // Stats.vue
 * const props = defineProps<PageContext>()
 */
export function renderVue<Ctx extends object>(component: Component): Mount<Ctx> {
  return (el, ctx) => {
    const props = reactive({ ...ctx });
    const app = createApp({ render: () => h(Suspense, null, () => h(component, props)) });
    app.mount(el);
    return { update: (ctx) => Object.assign(props, ctx), unmount: () => app.unmount() };
  };
}
