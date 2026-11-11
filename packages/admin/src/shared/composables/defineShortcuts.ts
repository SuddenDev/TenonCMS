import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useActiveElement, useDebounceFn, useEventListener, useTimeoutFn } from "@vueuse/core";
import { useKbd } from "./useKbd";

type ShortcutHandler = (event: KeyboardEvent) => void;

export interface ShortcutConfig {
  handler: ShortcutHandler;
  /** `true` also runs while an input has focus. A string runs only in the input with that `name`. */
  usingInput?: string | boolean;
}

/**
 * Shortcuts by key. `meta_k` combines keys with `_`, `g-d` chains two presses with `-`.
 * `meta` means Ctrl outside macOS. A falsy value disables the shortcut.
 */
export type ShortcutsConfig = Record<
  string,
  ShortcutConfig | ShortcutHandler | false | null | undefined
>;

export interface ShortcutsOptions {
  /** Milliseconds between the two presses of a chain. Default `800`. */
  chainDelay?: number;
  /** Matches `KeyboardEvent.code`, so a shortcut hits the same physical key on every layout. */
  layoutIndependent?: boolean;
}

interface Shortcut {
  handler: ShortcutHandler;
  enabled: boolean;
  chained: boolean;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const MODIFIERS = ["meta", "command", "ctrl", "shift", "alt", "option"];
// Besides letters, Shift on these keys keeps `event.key`, so a shortcut matches the Shift state.
const SHIFTABLE_KEYS = [
  "arrowleft",
  "arrowright",
  "arrowup",
  "arrowdown",
  "tab",
  "escape",
  "enter",
  "backspace",
];
const SPECIAL_CODES: Record<string, string> = {
  space: "Space",
  enter: "Enter",
  escape: "Escape",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
};
const SHIFTABLE_CODES = SHIFTABLE_KEYS.map(keyToCode);

function keyToCode(key: string) {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^\d$/.test(key)) return `Digit${key}`;
  if (/^f\d+$/i.test(key)) return key.toUpperCase();
  return SPECIAL_CODES[key.toLowerCase()] ?? key;
}

const isUnmodified = (s: Shortcut) => !s.metaKey && !s.ctrlKey && !s.altKey && !s.shiftKey;

/**
 * Registers keyboard shortcuts on `window` for the lifetime of the calling scope, like Nuxt UI's `defineShortcuts`.
 * Shortcuts skip inputs, textareas and editable content unless `usingInput` allows them.
 * An enabled match calls `preventDefault()` before its handler.
 * A standalone key that also starts a chain (`f` and `f-h`) waits until the chain completes or `chainDelay` passes.
 * @returns A function that removes the listener.
 */
export function defineShortcuts(
  config: MaybeRefOrGetter<ShortcutsConfig>,
  options: ShortcutsOptions = {},
) {
  const chainDelay = options.chainDelay ?? 800;
  const layoutIndependent = options.layoutIndependent ?? false;
  const { macOS } = useKbd();
  const activeElement = useActiveElement();

  const usingInput = computed(() => {
    const el = activeElement.value;
    const editable =
      el?.tagName === "INPUT" ||
      el?.tagName === "TEXTAREA" ||
      el?.contentEditable === "true" ||
      el?.contentEditable === "plaintext-only";
    return editable ? (el as HTMLInputElement).name || true : false;
  });

  const shortcuts = computed(() =>
    Object.entries(toValue(config)).flatMap(([key, value]): Shortcut[] => {
      if (!value) return [];
      const { handler, usingInput: inInput } =
        typeof value === "function" ? { handler: value, usingInput: false } : value;
      if (typeof handler !== "function") {
        console.warn(`[Shortcut] Invalid value for "${key}"`);
        return [];
      }

      const chained = key.includes("-") && key !== "-" && !key.includes("_");
      const parts = chained ? key.split("-") : key.toLowerCase().split("_");
      if (key.length > 1 && (chained || key.includes("_")) && !parts.every(Boolean))
        console.warn(`[Shortcut] Invalid key: "${key}"`);

      const enabled = !inInput
        ? !usingInput.value
        : typeof inInput === "string"
          ? usingInput.value === inInput
          : true;
      if (chained) {
        const chain = layoutIndependent ? parts.map(keyToCode) : parts.map((p) => p.toLowerCase());
        return [
          {
            handler,
            enabled,
            chained,
            key: chain.join("-"),
            metaKey: false,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
          },
        ];
      }

      const base = parts.filter((p) => !MODIFIERS.includes(p)).join("_");
      const meta = parts.includes("meta") || parts.includes("command");
      const ctrl = parts.includes("ctrl");
      const useCtrl = !macOS.value && meta && !ctrl;
      return [
        {
          handler,
          enabled,
          chained,
          key: layoutIndependent ? keyToCode(base) : base,
          metaKey: meta && !useCtrl,
          ctrlKey: ctrl || useCtrl,
          shiftKey: parts.includes("shift"),
          altKey: parts.includes("alt") || parts.includes("option"),
        },
      ];
    }),
  );
  const chainedShortcuts = computed(() => shortcuts.value.filter((s) => s.chained));
  const standardShortcuts = computed(() => shortcuts.value.filter((s) => !s.chained));
  const chainPrefixes = computed(
    () => new Set(chainedShortcuts.value.map((s) => s.key.split("-")[0])),
  );

  const presses: string[] = [];
  const clearPresses = () => void presses.splice(0);
  const clearPressesLater = useDebounceFn(clearPresses, chainDelay);

  let pending: { key: string; event: KeyboardEvent } | undefined;
  const pendingTimer = useTimeoutFn(
    () => {
      runPending();
      clearPresses();
    },
    chainDelay,
    { immediate: false },
  );
  function cancelPending() {
    pending = undefined;
    pendingTimer.stop();
  }
  function runPending() {
    const held = pending;
    cancelPending();
    if (!held) return;
    // Resolved again, because `enabled` may have changed since the press, for example when focus moved into an input.
    const shortcut = standardShortcuts.value.find((s) => s.key === held.key && isUnmodified(s));
    if (shortcut?.enabled) shortcut.handler(held.event);
  }

  function matches(s: Shortcut, e: KeyboardEvent) {
    if (layoutIndependent) {
      if (e.code !== s.key) return false;
    } else if (s.altKey && e.altKey) {
      // Option changes `event.key` on macOS (Alt+K is "˚"), so Alt shortcuts compare the code.
      if (e.code !== keyToCode(s.key)) return false;
    } else if (e.key.toLowerCase() !== s.key) return false;
    if (e.metaKey !== s.metaKey || e.ctrlKey !== s.ctrlKey || e.altKey !== s.altKey) return false;

    // Without Meta or Ctrl, Shift changes the key itself (`/` becomes `?`), so only some keys check it.
    const useCode = layoutIndependent || e.altKey;
    const letter = useCode ? /^Key[A-Z]$/i.test(e.code) : /^[a-z]$/i.test(e.key);
    const shiftable = useCode
      ? SHIFTABLE_CODES.includes(e.code)
      : SHIFTABLE_KEYS.includes(e.key.toLowerCase());
    const checksShift =
      letter || shiftable || s.shiftKey || (e.shiftKey && (e.metaKey || e.ctrlKey));
    return !checksShift || e.shiftKey === s.shiftKey;
  }

  function onKeyDown(e: KeyboardEvent) {
    // Autocomplete fires a keydown without a key.
    if (!e.key) return;

    presses.push(layoutIndependent ? e.code : e.key.toLowerCase());
    if (presses.length >= 2) {
      const chain = presses.slice(-2).join("-");
      const shortcut = chainedShortcuts.value.find((s) => s.key === chain);
      if (shortcut) {
        if (shortcut.enabled) {
          cancelPending();
          e.preventDefault();
          shortcut.handler(e);
        } else runPending();
        clearPresses();
        return;
      }
    }

    runPending();
    const shortcut = standardShortcuts.value.find((s) => matches(s, e));
    if (!shortcut) return void clearPressesLater();

    if (isUnmodified(shortcut) && chainPrefixes.value.has(shortcut.key)) {
      // `preventDefault()` has no effect once the event finished dispatching, so it runs now.
      if (shortcut.enabled) e.preventDefault();
      pending = { key: shortcut.key, event: e };
      pendingTimer.start();
      return;
    }

    if (shortcut.enabled) {
      e.preventDefault();
      shortcut.handler(e);
    }
    clearPresses();
  }

  return useEventListener("keydown", onKeyDown);
}
