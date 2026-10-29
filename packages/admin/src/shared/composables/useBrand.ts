import { computed, inject } from "vue";
import { optionsKey } from "@/shared/options";

/** Branding follows the public branding before sign-in and the admin registration after. */
export function useBrand() {
  const options = inject(optionsKey, {});
  return {
    name: computed(() => options.name ?? "tenoncms"),
    logo: computed(() => options.logo),
    icon: computed(() => options.icon),
  };
}
