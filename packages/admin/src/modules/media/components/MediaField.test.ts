// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import { i18n } from "@/shared/i18n";
import MediaField from "./MediaField.vue";

vi.mock("@/shared/api", () => ({
  client: {
    findById: (_: string, id: string) =>
      Promise.resolve({ id, filename: `${id}.jpg`, mimeType: "image/jpeg" }),
  },
}));
vi.mock("vue-router", () => ({ RouterLink: { render: () => null } }));

let app: App | undefined;
afterEach(() => app?.unmount());

function mount() {
  const value = ref(["a", "b", "c"]);
  const root = document.createElement("div");
  app = createApp({
    render: () =>
      h(MediaField, {
        field: { type: "image", many: true } as never,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string[]) => (value.value = v),
      }),
  }).use(i18n);
  app.mount(root);
  return { root, value };
}

const fire = (el: Element, type: string) =>
  el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));

it("moves a file by dragging its handle below another row", async () => {
  const { root, value } = mount();
  const handles = root.querySelectorAll("[data-handle]");
  fire(handles[0]!, "dragstart");
  await nextTick();
  // happy-dom has no layout, so the pointer counts as over the lower half.
  fire(root.querySelectorAll("li")[2]!, "dragover");
  await nextTick();
  fire(root.querySelector("ul")!, "drop");

  expect(value.value).toEqual(["b", "c", "a"]);
});

it("moves a file with the arrow keys and keeps the focus on its handle", async () => {
  const { root, value } = mount();
  document.body.append(root);
  root
    .querySelectorAll<HTMLElement>("[data-handle]")[1]!
    .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
  await vi.waitFor(() => expect(value.value).toEqual(["b", "a", "c"]));
  await nextTick();
  expect(document.activeElement).toBe(root.querySelectorAll("[data-handle]")[0]);
  root.remove();
});
