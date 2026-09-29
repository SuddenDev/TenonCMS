import { createHead } from "@unhead/vue/client";
import { createApp } from "vue";
import type { AdminOptions, AdminPlugin, IntegralContext } from "../../core/src/admin/index.d.ts";
import App from "./App.vue";
import { integralKey, mergeOptions, optionsKey } from "./lib/options";
import { createAdminRouter } from "./router";
import css from "./style.css?inline";

export function defineAdmin(options: AdminOptions): AdminOptions {
  return options;
}

export function defineAdminPlugin(plugin: AdminPlugin): AdminPlugin {
  return plugin;
}

export function mountAdmin(el: string | Element, raw: AdminOptions = {}, base = "/admin") {
  const options = mergeOptions(raw);
  // The styles are global. The admin runs on a page of its own, so they never reach the host's pages.
  document.head.append(Object.assign(document.createElement("style"), { textContent: css }));
  const router = createAdminRouter(base, options.pages);
  const integral: IntegralContext = { base, navigate: (path: string) => void router.push(path) };
  const app = createApp(App)
    .use(router)
    .use(createHead())
    .provide(optionsKey, options)
    .provide(integralKey, integral);
  app.mount(el);
  return () => app.unmount();
}
