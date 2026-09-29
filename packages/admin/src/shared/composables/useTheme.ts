import { useColorMode } from "@vueuse/core";

/**
 * The admin's color mode: `light`, `dark` or `auto` (the OS setting). Sets the `dark` class on `<html>`.
 * The key is the admin's own, because the admin shares its origin and storage with the host site.
 */
export function useTheme() {
  return useColorMode({ storageKey: "integral-admin-theme" }).store;
}
