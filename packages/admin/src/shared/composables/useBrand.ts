import { inject } from "vue";
import { optionsKey } from "@/shared/options";

/** The name, logo and icon from `integral.admin.ts`. */
export function useBrand() {
  const { name = "integral-cms", logo, icon } = inject(optionsKey, {});
  return { name, logo, icon };
}
