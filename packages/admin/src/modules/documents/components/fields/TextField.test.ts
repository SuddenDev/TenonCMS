// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { createApp, h } from "vue";
import { i18n } from "@/shared/i18n";
import TextField from "./TextField.vue";

function render(suffix?: string, field: object = {}) {
  const root = document.createElement("div");
  createApp({
    render: () =>
      h(TextField, {
        name: "title",
        field: { type: "text", ...field } as never,
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

it("shows a fixed prefix and suffix around the input", () => {
  const root = render(undefined, { prefix: "https://", suffix: { en: ".com", de: ".de" } });
  const group = root.querySelector('[data-slot="button-group"]');

  expect(group?.firstElementChild?.textContent).toBe("https://");
  expect(group?.lastElementChild?.textContent).toBe(".com");
  expect(group?.querySelector("input")).not.toBeNull();
});
