// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import { i18n } from "@/shared/i18n";
import TimezoneSelect from "./TimezoneSelect.vue";

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = "";
});

it("picks a zone by search and returns to the device's", async () => {
  i18n.global.locale.value = "en";
  const zone = ref<string | null>(null);
  const root = document.createElement("div");
  document.body.append(root);
  app = createApp({
    render: () =>
      h(TimezoneSelect, {
        modelValue: zone.value,
        "onUpdate:modelValue": (v: string | null) => (zone.value = v),
      }),
  }).use(i18n);
  app.mount(root);
  expect(root.textContent).toContain("This device");

  root.querySelector("button")!.click();
  await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull());
  const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
  input.value = "Europe/Berlin";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  const options = [...document.querySelectorAll('[role="option"]')];
  expect(options).toHaveLength(1);
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await vi.waitFor(() => expect(zone.value).toBe("Europe/Berlin"));
  await vi.waitFor(() => expect(root.textContent).toContain("Berlin"));
  expect(root.textContent).toContain("Europe");

  root.querySelector("button")!.click();
  await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull());
  const again = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
  again.value = "device";
  again.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  again.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  again.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await vi.waitFor(() => expect(zone.value).toBeNull());
});
