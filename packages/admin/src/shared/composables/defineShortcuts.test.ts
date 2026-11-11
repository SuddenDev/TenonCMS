// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, type App } from "vue";
import { defineShortcuts, type ShortcutsConfig } from "./defineShortcuts";

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function mount(config: ShortcutsConfig) {
  app = createApp({ setup: () => void defineShortcuts(config), render: () => null });
  app.mount(document.createElement("div"));
}

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );

it("maps meta to Ctrl outside macOS and skips inputs unless allowed", () => {
  const select = vi.fn();
  const save = vi.fn();
  mount({ meta_a: select, meta_s: { handler: save, usingInput: true } });

  press("a", { metaKey: true });
  expect(select).not.toHaveBeenCalled();
  expect(press("a", { ctrlKey: true })).toBe(false);
  expect(select).toHaveBeenCalledOnce();

  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  press("a", { ctrlKey: true }, input);
  press("s", { ctrlKey: true }, input);
  expect(select).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledOnce();
});

it("runs a chain, and a standalone prefix key only after the chain delay", () => {
  vi.useFakeTimers();
  const go = vi.fn();
  const find = vi.fn();
  mount({ f: find, "f-h": go });

  press("f");
  press("h");
  expect(go).toHaveBeenCalledOnce();
  expect(find).not.toHaveBeenCalled();

  press("f");
  vi.advanceTimersByTime(800);
  expect(find).toHaveBeenCalledOnce();
});
