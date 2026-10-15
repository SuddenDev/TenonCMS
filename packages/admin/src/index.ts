import type { ClientRegistry } from "../../core/src/admin/browser/lazy-mount.ts";
import { reactive, shallowRef } from "vue";
import { client } from "./shared/api";
import { configureKey, pageDataKey, registryKey, type Branding } from "./shared/options";
import { createHead } from "@unhead/vue/client";
import { createApp } from "vue";
import type { AdminDescriptor, IntegralContext } from "../../core/src/admin/index.d.ts";
import App from "./App.vue";
import { integralKey, optionsKey } from "@/shared/options";
import { i18n } from "./shared/i18n";
import { addAdminPages, createAdminRouter } from "./router";
import css from "./style.css?inline";

/**
 * Mounts the admin and returns the cleanup.
 * @param base Path the admin is served at.
 * @param hostFavicon Favicon of the host, used when the branding sets none.
 * @param registry Browser exports found in the server configuration, by `clientRef()` specifier.
 */
export function mountAdmin(
  el: string | Element,
  base = "/admin",
  hostFavicon?: string | null,
  registry: ClientRegistry = {},
) {
  const options = reactive<Branding>({});
  const brand = ({ name, logo, icon, favicon }: Branding) =>
    Object.assign(options, {
      name,
      logo,
      icon,
      favicon: favicon ?? icon ?? hostFavicon ?? undefined,
    });
  brand({});
  void client
    .request<Branding>("/admin-brand")
    .then(brand)
    .catch(() => {});
  // The styles are global. The admin runs on a page of its own, so they never reach the host's pages.
  // They MUST come first: the first sheet fixes the cascade layer order, and a host bundler may put plugin CSS into
  // the page (Astro inlines CSS of dynamic imports). Plugin CSS that declared `utilities` first would lose to `base`.
  document.head.prepend(Object.assign(document.createElement("style"), { textContent: css }));
  const router = createAdminRouter(base);
  const configure = async (admin: AdminDescriptor) => {
    brand(admin);
    await addAdminPages(router, admin.pages);
  };
  const integral: Omit<IntegralContext, "locale"> = {
    base,
    navigate: (path: string) => void router.push(path),
    reload: async () => {},
  };
  const app = createApp(App)
    .use(router)
    .use(createHead())
    .use(i18n)
    .provide(configureKey, configure)
    .provide(registryKey, registry)
    .provide(optionsKey, options)
    .provide(pageDataKey, shallowRef())
    .provide(integralKey, integral);
  app.mount(el);
  return () => app.unmount();
}
