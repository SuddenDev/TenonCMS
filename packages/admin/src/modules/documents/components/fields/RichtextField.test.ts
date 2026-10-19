// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import { i18n } from "@/shared/i18n";
import { schema } from "@/shared/api";
import RichtextField from "./RichtextField.vue";
import editorCss from "./richtext/style.css?raw";
import type { RichtextDocument } from "../../../../../../core/src/richtext/config/types";

let app: App | undefined;
let root: HTMLElement;
afterEach(() => {
  app?.unmount();
  root?.remove();
});
async function render(document: RichtextDocument, readOnly = false) {
  schema.value = {};
  root = window.document.createElement("div");
  window.document.body.append(root);

  const value = ref(document);
  app = createApp({
    render: () =>
      h(RichtextField, {
        name: "body",
        field: { type: "richtext", readOnly },
        root: {},
        siblings: { fields: {}, data: {} },
        modelValue: value.value,
        "onUpdate:modelValue": (next) => {
          value.value = next!;
        },
      }),
  }).use(i18n);

  app.mount(root);
  await nextTick();
  await nextTick();

  return value;
}
const document: RichtextDocument = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
};

it("mounts the real editor, labels its textbox and writes standard JSON", async () => {
  const value = await render(document);
  const textbox = root.querySelector('[role="textbox"]');

  expect(textbox?.getAttribute("aria-label")).toBe("body");
  expect(textbox?.textContent).toBe("Hello");

  const select = root.querySelector("select")!;
  select.value = "2";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await nextTick();

  expect(value.value.content?.[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
});

it("disables editing and formatting for read-only fields", async () => {
  await render(document, true);

  expect(root.querySelector('[role="textbox"]')?.getAttribute("contenteditable")).toBe("false");
  expect(root.querySelector("fieldset")?.disabled).toBe(true);
});

it("renders at 14px without adding font sizes to the document", async () => {
  const value = await render(document);
  const style = window.document.createElement("style");
  style.textContent = editorCss;
  window.document.head.append(style);

  try {
    expect(getComputedStyle(root.querySelector(".cms-richtext-content")!).fontSize).toBe("14px");
    expect(value.value).toEqual(document);
  } finally {
    style.remove();
  }
});

it("preserves unsupported plugin JSON without mounting a destructive editor", async () => {
  const unsupported: RichtextDocument = {
    type: "doc",
    content: [{ type: "missingPlugin", attrs: { value: "Keep this" } }],
  };
  const value = await render(unsupported);

  expect(root.querySelector('[contenteditable="true"]')).toBeNull();
  expect(root.querySelector('[role="alert"]')?.textContent).toContain("original JSON is preserved");
  expect(value.value).toEqual(unsupported);
});
