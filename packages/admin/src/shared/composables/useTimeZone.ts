import { computed, ref } from "vue";
import { deviceTimeZone, validTimeZone } from "@/shared/timezones";

// The signed-in user's choice. `null` follows the device.
const preferred = ref<string | null>(null);
const timeZone = computed(() =>
  validTimeZone(preferred.value) ? preferred.value : deviceTimeZone(),
);

/** The time zone dates are shown and entered in: the user's preference, else the device's. */
export function useTimeZone() {
  return { preferred, timeZone };
}
