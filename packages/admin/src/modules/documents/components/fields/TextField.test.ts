// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { createApp, h, nextTick } from "vue";
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

it("shows a masked value and stores the raw one", async () => {
  const saved: unknown[] = [];
  const root = document.createElement("div");
  createApp({
    render: () =>
      h(TextField, {
        name: "card",
        field: { type: "text", mask: "#### ####", pattern: "\\d{8}", maxLength: 8 } as never,
        root: {},
        siblings: { fields: {}, data: {} },
        modelValue: "1234",
        "onUpdate:modelValue": (v: unknown) => saved.push(v),
      }),
  })
    .use(i18n)
    .mount(root);
  const input = root.querySelector("input")!;

  expect(input.value).toBe("1234");
  expect(input.hasAttribute("pattern")).toBe(false);
  expect(input.hasAttribute("maxlength")).toBe(false);

  input.value = "1234567x89";
  input.dispatchEvent(new Event("input"));
  await nextTick();

  expect(input.value).toBe("1234 5678");
  expect(saved.at(-1)).toBe("12345678");
});
