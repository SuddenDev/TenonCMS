import { useColorMode, usePreferredDark } from "@vueuse/core";

export function useTheme() {
  const initialValue = usePreferredDark().value ? "dark" : "light";
  return useColorMode({ storageKey: "tenon-admin-theme", initialValue }).store;
}
