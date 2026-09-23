import { useHead } from "@unhead/vue";
import { createHead } from "@unhead/vue/client";
import { createApp, h } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import type {
  AdminOptions,
  IntegralContext,
  Page,
} from "../../core/src/admin/index.d.ts";
import App from "./App.vue";
import Mount from "./components/Mount.vue";
import CollectionList from "./pages/CollectionList.vue";
import DocEdit from "./pages/DocEdit.vue";
import GlobalEdit from "./pages/GlobalEdit.vue";
import Home from "./pages/Home.vue";
import { integralKey, optionsKey, pagePath } from "./options";
import css from "./style.css?inline";

export function defineAdmin(options: AdminOptions): AdminOptions {
  return options;
}

export function mountAdmin(
  el: string | Element,
  options: AdminOptions = {},
  base = "/admin",
) {
  // The styles are global. The admin runs on a page of its own, so they never reach the host's pages.
  document.head.append(
    Object.assign(document.createElement("style"), { textContent: css }),
  );
  const page = ({ mount, label }: Page) => ({
    setup() {
      useHead({ title: label });
      return () =>
        h(Mount, {
          mount,
          ctx: {
            params: router.currentRoute.value.params,
            query: router.currentRoute.value.query,
          },
        });
    },
  });
  const router = createRouter({
    history: createWebHistory(`${base}/`),
    // Host pages come first. On an equal path the router keeps the first route, so they replace built-in views.
    routes: [
      ...Object.entries(options.pages ?? {}).map(([key, p]) => ({
        path: pagePath(key, p),
        component: page(p),
      })),
      { path: "/", component: Home },
      { path: "/collections/:name", component: CollectionList },
      { path: "/collections/:name/:id", component: DocEdit },
      { path: "/globals/:name", component: GlobalEdit },
    ],
  });
  const integral: IntegralContext = { base, navigate: (path: string) => void router.push(path) };
  const app = createApp(App)
    .use(router)
    .use(createHead())
    .provide(optionsKey, options)
    .provide(integralKey, integral);
  app.mount(el);
  return () => app.unmount();
}
