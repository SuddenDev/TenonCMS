import { reactive, computed, onMounted } from "vue";
import { createSharedComposable } from "@vueuse/core";

type KbdKeysSpecificMap = {
  meta: string;
  alt: string;
  ctrl: string;
};

/** Keyboard symbols; platform-specific modifier labels come from `useKbd()`. */
export const kbdKeysMap = {
  meta: "",
  ctrl: "",
  alt: "",
  win: "⊞",
  command: "⌘",
  shift: "⇧",
  control: "⌃",
  option: "⌥",
  enter: "↵",
  space: "␣",
  delete: "⌦",
  backspace: "⌫",
  escape: "⎋",
  tab: "⇥",
  capslock: "⇪",
  arrowup: "↑",
  arrowright: "→",
  arrowdown: "↓",
  arrowleft: "←",
  pageup: "⇞",
  pagedown: "⇟",
  home: "↖",
  end: "↘",
};

/** A key with a known keyboard symbol. */
export type KbdKey = keyof typeof kbdKeysMap;
/** A modifier whose label depends on the operating system. */
export type KbdKeySpecific = keyof KbdKeysSpecificMap;

const _useKbd = () => {
  const macOS = computed(
    () => window && navigator && navigator.userAgent && navigator.userAgent.match(/Macintosh;/),
  );

  const kbdKeysSpecificMap = reactive({
    meta: " ",
    alt: " ",
    ctrl: " ",
  });

  onMounted(() => {
    kbdKeysSpecificMap.meta = macOS.value ? kbdKeysMap.command : "Ctrl";
    kbdKeysSpecificMap.ctrl = macOS.value ? kbdKeysMap.control : "Ctrl";
    kbdKeysSpecificMap.alt = macOS.value ? kbdKeysMap.option : "Alt";
  });

  function getKbdKey(value?: KbdKey | string) {
    if (!value) {
      return;
    }

    if (["meta", "alt", "ctrl"].includes(value)) {
      return kbdKeysSpecificMap[value as KbdKeySpecific];
    }

    return kbdKeysMap[value as KbdKey] || value.toUpperCase();
  }

  return {
    macOS,
    getKbdKey,
  };
};

/** Shares platform-specific keyboard labels after the component mounts. */
export const useKbd = /* @__PURE__ */ createSharedComposable(_useKbd);
