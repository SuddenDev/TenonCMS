import { createHead } from "@unhead/vue/client";
import { createApp, nextTick, type App } from "vue";
import { vi } from "vitest";
import AppRoot from "@/App.vue";
import { createAdminRouter } from "@/router";
import { i18n } from "@/shared/i18n";

let app: App | undefined;
let root: HTMLElement | undefined;

/** Mounts the whole admin at `path`, as `mountAdmin()` does. */
export async function render(path: string, base = "/cms") {
  const router = createAdminRouter(base);
  await router.push(path);
  root = document.createElement("div");
  document.body.append(root);
  app = createApp(AppRoot).use(router).use(createHead()).use(i18n);
  app.mount(root);
  await nextTick();
  return { router, root };
}

export function cleanup() {
  app?.unmount();
  root?.remove();
  app = root = undefined;
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
}

export async function fill(root: HTMLElement, selector: string, value: string) {
  const input = root.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}

export function submit(root: HTMLElement) {
  root
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}
