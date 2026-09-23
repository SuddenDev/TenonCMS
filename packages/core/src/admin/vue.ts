import { createApp, h, reactive, Suspense, type Component } from 'vue'
import type { Mount } from './index.d.ts'

// Mounts a Vue component with the context as reactive props. Top-level await works.
export function renderVue<Ctx extends object>(component: Component): Mount<Ctx> {
  return (el, ctx) => {
    const props = reactive({ ...ctx })
    const app = createApp({ render: () => h(Suspense, null, () => h(component, props)) })
    app.mount(el)
    return { update: (ctx) => Object.assign(props, ctx), unmount: () => app.unmount() }
  }
}
