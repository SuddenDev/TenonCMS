import { useHead } from "@unhead/vue";
import { createHead } from "@unhead/vue/client";
import { createApp, h } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import type {
  AdminOptions,
  AdminPlugin,
  IntegralContext,
  Page,
} from "../../core/src/admin/index.d.ts";
import App from "./App.vue";
import Mount from "./components/Mount.vue";
import CollectionList from "./pages/CollectionList.vue";
import DocEdit from "./pages/DocEdit.vue";
import GlobalEdit from "./pages/GlobalEdit.vue";
import Home from "./pages/Home.vue";
import Media from "./pages/Media.vue";
import MediaFile from "./pages/MediaFile.vue";
import { integralKey, optionsKey, pagePath } from "./options";
import css from "./style.css?inline";

export function defineAdmin(options: AdminOptions): AdminOptions {
  return options;
}

export function defineAdminPlugin(plugin: AdminPlugin): AdminPlugin {
  return plugin;
}

// The plugins' fields and pages, then the host's. A key used twice throws.
function merge({ plugins = [], ...host }: AdminOptions): AdminOptions {
  const out: Required<Pick<AdminOptions, "fields" | "pages">> = { fields: {}, pages: {} };
  for (const { name, ...plugin } of [...plugins, { name: "integral.admin.ts", ...host }]) {
    for (const kind of ["fields", "pages"] as const) {
      for (const [key, value] of Object.entries(plugin[kind] ?? {})) {
        if (Object.hasOwn(out[kind], key))
          throw new Error(`integral-cms: duplicate admin ${kind} key "${key}" in ${name}`);
        out[kind][key] = value as never;
      }
    }
  }
  return out;
}

export function mountAdmin(el: string | Element, raw: AdminOptions = {}, base = "/admin") {
  const options = merge(raw);
  // The styles are global. The admin runs on a page of its own, so they never reach the host's pages.
  document.head.append(Object.assign(document.createElement("style"), { textContent: css }));
  const page = ({ mount, menu }: Page) => ({
    setup() {
      useHead({ title: menu?.label });
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
      { path: "/media/:folder(.*)?", component: Media },
      { path: "/media-file/:id", component: MediaFile },
      // The media library is written only through the media API, so its generic views redirect.
      { path: "/collections/media", redirect: "/media" },
      { path: "/collections/media/:id", redirect: (to) => `/media-file/${String(to.params.id)}` },
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
