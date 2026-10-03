import { useColorMode, usePreferredDark } from "@vueuse/core";

export function useTheme() {
  const initialValue = usePreferredDark().value ? "dark" : "light";
  return useColorMode({ storageKey: "integral-admin-theme", initialValue }).store;
}
