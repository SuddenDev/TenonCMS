// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { createApp, h } from "vue";
import { i18n } from "@/shared/i18n";
import FieldLayout from "./FieldLayout.vue";

it("draws a separator above a field, with an optional heading", () => {
  const fields = {
    title: { type: "text" },
    image: { type: "text", separator: "Social" },
    noindex: { type: "text", separator: true },
  };
  const root = document.createElement("div");
  createApp({
    render: () =>
      h(FieldLayout, { fields: fields as never }, { field: ({ name }: { name: string }) => name }),
  })
    .use(i18n)
    .mount(root);

  expect(root.querySelectorAll('[data-slot="separator"]')).toHaveLength(2);
  expect(root.textContent).toBe("titleSocialimagenoindex");
});

it("does not render a hidden field", () => {
  const fields = { title: { type: "text" }, slug: { type: "text", hidden: true } };
  const root = document.createElement("div");
  createApp({
    render: () =>
      h(FieldLayout, { fields: fields as never }, { field: ({ name }: { name: string }) => name }),
  })
    .use(i18n)
    .mount(root);

  expect(root.textContent).toContain("title");
  expect(root.textContent).not.toContain("slug");
});
