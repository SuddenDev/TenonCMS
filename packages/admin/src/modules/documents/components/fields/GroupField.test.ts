// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { createApp, h, reactive } from "vue";
import { i18n } from "@/shared/i18n";
import GroupField from "./GroupField.vue";

function render(appearance?: "plain") {
  const root = document.createElement("div");
  const model = reactive<Record<string, unknown>>({ title: "" });
  createApp({
    render: () =>
      h(GroupField, {
        name: "meta",
        field: {
          type: "group",
          label: "Meta",
          ...(appearance && { appearance }),
          fields: { title: { type: "text" } },
        } as never,
        root: {},
        siblings: { fields: {}, data: {} },
        modelValue: model,
      }),
  })
    .use(i18n)
    .mount(root);
  return root;
}

it("shows a box with a heading by default", () => {
  const fieldset = render().querySelector("fieldset")!;

  expect(fieldset.className).toContain("border");
  expect(fieldset.querySelector("legend")?.className).not.toContain("sr-only");
});

it("shows only the fields with `appearance: 'plain'`", () => {
  const fieldset = render("plain").querySelector("fieldset")!;

  expect(fieldset.className).not.toContain("border");
  expect(fieldset.querySelector("legend")?.className).toContain("sr-only");
});
