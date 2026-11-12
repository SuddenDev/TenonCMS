import { computed, inject } from "vue";
import { logoAt } from "../../../../core/src/admin/browser/logo";
import { optionsKey } from "@/shared/options";

/** Branding follows the public branding before sign-in and the admin registration after. */
export function useBrand() {
  const options = inject(optionsKey, {});
  return {
    name: computed(() => options.name ?? "tenoncms"),
    headerLogo: computed(() => logoAt(options.logo, "header")),
    loginLogo: computed(() => logoAt(options.logo, "login")),
    icon: computed(() => options.icon),
  };
}
