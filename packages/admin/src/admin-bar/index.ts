import { createApp, h, shallowRef } from "vue";
import type { AdminBarContext } from "../../../core/src/admin/index.d.ts";
import AdminBar from "./AdminBar.vue";
import css from "./style.css?inline";

/**
 * Mounts the admin bar into `el`. The site's preview runtime calls it for signed-in editors.
 * @param el Usually an open shadow root, so the host's CSS cannot reach the bar.
 * @returns `update` renders a new context, `unmount` removes the bar.
 */
export function mountAdminBar(el: HTMLElement | ShadowRoot, ctx: AdminBarContext) {
  const style = Object.assign(document.createElement("style"), { textContent: css });
  const root = Object.assign(document.createElement("div"), { className: "admin-bar-root" });
  const app = document.createElement("div");
  const portal = document.createElement("div");
  root.append(app, portal);
  el.append(style, root);

  const dark = matchMedia("(prefers-color-scheme: dark)");
  const theme = () => root.classList.toggle("dark", dark.matches);
  theme();
  dark.addEventListener("change", theme);

  const context = shallowRef(ctx);
  const vue = createApp({ render: () => h(AdminBar, { ctx: context.value, root, portal }) });
  vue.mount(app);

  return {
    update(next: AdminBarContext) {
      context.value = next;
    },
    unmount() {
      vue.unmount();
      dark.removeEventListener("change", theme);
      style.remove();
      root.remove();
    },
  };
}
