import { createApp, h, reactive, Suspense, type Component } from 'vue'
import type { Mount } from './index.d.ts'

export type { FieldContext, Mount, PageContext } from './index.d.ts'

/**
 * Turns a Vue component into a {@link Mount} for `integral.admin.ts`.
 *
 * The context arrives as props and stays reactive: watch `params.id` to refetch on route changes.
 * The component runs in its own Vue app inside `<Suspense>`, so top-level `await` works.
 * @example
 * // integral.admin.ts
 * pages: { stats: { label: 'Stats', mount: renderVue(Stats) } }
 *
 * // Stats.vue
 * const props = defineProps<PageContext>()
 */
export function renderVue<Ctx extends object>(component: Component): Mount<Ctx> {
  return (el, ctx) => {
    const props = reactive({ ...ctx })
    const app = createApp({ render: () => h(Suspense, null, () => h(component, props)) })
    app.mount(el)
    return { update: (ctx) => Object.assign(props, ctx), unmount: () => app.unmount() }
  }
}
