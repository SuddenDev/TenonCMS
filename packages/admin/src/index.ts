import { createApp, h } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import type { AdminOptions, Mount as MountFn, PageContext } from '../../core/src/admin/index.d.ts'
import { api } from './api'
import App from './App.vue'
import Mount from './components/Mount.vue'
import CollectionList from './pages/CollectionList.vue'
import DocEdit from './pages/DocEdit.vue'
import GlobalEdit from './pages/GlobalEdit.vue'
import Home from './pages/Home.vue'
import { optionsKey, pagePath } from './options'
import css from './style.css?inline'

export function defineAdmin(options: AdminOptions): AdminOptions {
  return options
}

export function mountAdmin(el: string | Element, options: AdminOptions = {}) {
  // The admin's Tailwind reset is global. It MUST leave with the admin, or it restyles the host's pages.
  const ownsStyle = !document.querySelector('style[data-integral]')
  const style = document.createElement('style')
  if (ownsStyle) {
    style.setAttribute('data-integral', '')
    style.textContent = css
    document.head.append(style)
  }
  const page = (mount: MountFn<PageContext>) => ({
    render: () => h(Mount, { mount, ctx: { api, params: router.currentRoute.value.params, query: router.currentRoute.value.query } }),
  })
  const router = createRouter({
    history: createWebHistory('/admin/'),
    // Host pages come first. On an equal path the router keeps the first route, so they replace built-in views.
    routes: [
      ...Object.entries(options.pages ?? {}).map(([key, p]) => ({ path: pagePath(key, p), component: page(p.mount) })),
      { path: '/', component: Home },
      { path: '/collections/:name', component: CollectionList },
      { path: '/collections/:name/:id', component: DocEdit },
      { path: '/globals/:name', component: GlobalEdit },
    ],
  })
  const app = createApp(App).use(router).provide(optionsKey, options)
  app.mount(el)
  return () => {
    app.unmount()
    if (ownsStyle) style.remove()
  }
}
