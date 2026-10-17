// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import type { ToggleGroupRootProps } from "reka-ui";
import { ToggleGroup, ToggleGroupItem } from ".";

let app: App;
let root: HTMLElement;
afterEach(() => {
  app?.unmount();
  root?.remove();
});

function setup(type: "single" | "multiple", disabled = false, required = false) {
  const value = ref<ToggleGroupRootProps["modelValue"]>(type === "multiple" ? [] : undefined);
  root = document.createElement("form");
  document.body.append(root);
  app = createApp({
    render: () =>
      h(
        ToggleGroup,
        {
          type,
          disabled,
          required,
          modelValue: value.value,
          "onUpdate:modelValue": (v: ToggleGroupRootProps["modelValue"]) => (value.value = v),
        },
        () => ["a", "b"].map((option) => h(ToggleGroupItem, { value: option }, () => option)),
      ),
  });
  app.mount(root);
  return value;
}

it("selects one item and clears it on a second click", async () => {
  const value = setup("single");
  const buttons = root.querySelectorAll("button");
  buttons[0].click();
  await nextTick();
  expect(value.value).toBe("a");
  buttons[1].click();
  await nextTick();
  expect(value.value).toBe("b");
  expect(buttons[0].dataset.state).toBe("off");
  expect(buttons[1].dataset.state).toBe("on");
  buttons[1].click();
  await nextTick();
  expect(value.value).toBeUndefined();
});

it("toggles multiple items and follows external model updates", async () => {
  const value = setup("multiple");
  const buttons = root.querySelectorAll("button");
  buttons[0].click();
  await nextTick();
  buttons[1].click();
  await nextTick();
  expect(value.value).toEqual(["a", "b"]);
  expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
  buttons[0].click();
  await nextTick();
  expect(value.value).toEqual(["b"]);
  value.value = ["a"];
  await nextTick();
  expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
  expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
});

it("disables all items through the group", () => {
  const value = setup("multiple", true);
  const buttons = root.querySelectorAll("button");
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    expect(button.disabled).toBe(true);
    expect(button.type).toBe("button");
    button.click();
  }
  expect(value.value).toEqual([]);
});

it("keeps keyboard navigation between items", async () => {
  setup("single");
  await nextTick();
  const buttons = root.querySelectorAll("button");
  buttons[0].focus();
  buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await vi.waitFor(() => expect(document.activeElement).toBe(buttons[1]));
});

it.each(["single", "multiple"] as const)(
  "keeps the last required selection in %s mode",
  async (type) => {
    const value = setup(type, false, true);
    const buttons = root.querySelectorAll("button");
    expect(value.value).toEqual(type === "multiple" ? [] : undefined);
    buttons[0].click();
    await nextTick();
    buttons[0].click();
    await nextTick();
    expect(value.value).toEqual(type === "multiple" ? ["a"] : "a");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    buttons[1].click();
    await nextTick();
    if (type === "multiple") {
      expect(value.value).toEqual(["a", "b"]);
      buttons[0].click();
      await nextTick();
    }
    expect(value.value).toEqual(type === "multiple" ? ["b"] : "b");
    buttons[1].click();
    await nextTick();
    expect(value.value).toEqual(type === "multiple" ? ["b"] : "b");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
  },
);

it.each(["single", "multiple"] as const)(
  "keeps required uncontrolled selections in %s mode",
  async (type) => {
    root = document.createElement("div");
    document.body.append(root);
    const update = vi.fn();
    app = createApp({
      render: () =>
        h(
          ToggleGroup,
          {
            type,
            required: true,
            defaultValue: type === "multiple" ? ["a"] : "a",
            "onUpdate:modelValue": update,
          },
          () => h(ToggleGroupItem, { value: "a" }, () => "Alpha"),
        ),
    });
    app.mount(root);
    const button = root.querySelector("button")!;
    button.click();
    await nextTick();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(update).not.toHaveBeenCalled();
  },
);
