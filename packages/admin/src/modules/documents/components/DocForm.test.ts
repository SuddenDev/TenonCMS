// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, h, type App } from "vue";
import { toast } from "vue-sonner";
import { i18n } from "@/shared/i18n";
import DocForm from "./DocForm.vue";

vi.mock("vue-sonner", () => ({ toast: vi.fn() }));

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  vi.clearAllMocks();
});

function mount(props: Record<string, unknown>) {
  app = createApp({
    render: () =>
      h(DocForm, { fields: { title: { type: "text" } }, initial: { title: "Hi" }, ...props }),
  }).use(i18n);
  app.mount(document.createElement("div"));
}

const pressSave = () =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true }));

it("saves on Cmd/Ctrl+S without drafts", async () => {
  const save = vi.fn(async () => {});
  mount({ save });

  expect(pressSave()).toBe(false);
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(toast).not.toHaveBeenCalled();
});

it("says that drafts save on their own", () => {
  mount({ saveDraft: vi.fn(async () => {}) });

  expect(pressSave()).toBe(false);
  expect(toast).toHaveBeenCalledOnce();
});

it("leaves Cmd/Ctrl+S to the browser on a read-only form", () => {
  mount({});

  expect(pressSave()).toBe(true);
});
