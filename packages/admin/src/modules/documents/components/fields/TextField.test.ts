// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { createApp, h } from "vue";
import { i18n } from "@/shared/i18n";
import TextField from "./TextField.vue";

function render(suffix?: string) {
  const root = document.createElement("div");
  createApp({
    render: () =>
      h(TextField, {
        name: "title",
        field: { type: "text" } as never,
        root: {},
        siblings: { fields: {}, data: {} },
        modelValue: "Buy watches",
        suffix,
      }),
  })
    .use(i18n)
    .mount(root);
  return root;
}

it("shows a muted suffix after the value", () => {
  const ghost = render(" · Acme").querySelector('[data-slot="suffix"]');

  expect(ghost?.getAttribute("aria-hidden")).toBe("true");
  expect(ghost?.textContent).toBe("Buy watches · Acme");
});

it("shows no suffix without one", () => {
  expect(render().querySelector('[data-slot="suffix"]')).toBeNull();
});
