// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, h, provide, ref } from "vue";
import { i18n } from "@/shared/i18n";
import { focusKey } from "@/modules/documents/fields";
import FieldInput from "./FieldInput.vue";

afterEach(() => vi.restoreAllMocks());

it("scrolls to and focuses a field that mounts with the focus on it", async () => {
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as never);
  const focus = ref<string | null>("content.0.headline");
  const root = document.createElement("div");
  document.body.append(root);
  createApp({
    setup: () => provide(focusKey, focus),
    render: () =>
      h(FieldInput, {
        name: "headline",
        path: "content.0.headline",
        field: { type: "text" } as never,
        root: {},
        siblings: { fields: {}, data: {} },
        modelValue: "Hi",
      }),
  })
    .use(i18n)
    .mount(root);
  await new Promise((r) => setTimeout(r, 20));

  expect(scroll).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(root.querySelector("input"));
  expect(focus.value).toBeNull();
});
