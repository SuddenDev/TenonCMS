import { useStorage } from "@vueuse/core";
import { computed, watch } from "vue";
import { createI18n } from "vue-i18n";
import de from "./de";
import en from "./en";
import { translate } from "../../../../core/src/admin/browser/text.ts";
import type { AdminLocale, Text } from "../../../../core/src/admin/index.d.ts";
import {
  ADMIN_LOCALE_KEY,
  ADMIN_LOCALES,
  pickAdminLocale,
} from "../../../../core/src/admin/browser/locale.ts";

export type Messages = typeof en;

declare module "vue-i18n" {
  export interface DefineLocaleMessage extends Messages {}
}

// A throwing or missing storage only means the choice is not remembered. Without a choice, the browser language
// applies, so it is not written as a default.
const stored = useStorage(ADMIN_LOCALE_KEY, "", undefined, {
  onError: () => {},
  writeDefaults: false,
});
const locale = computed<AdminLocale>({
  get: () => pickAdminLocale(stored.value, navigator.languages),
  set: (code) => (stored.value = code),
});

export const i18n = createI18n<[Messages], AdminLocale, false>({
  legacy: false,
  locale: locale.value,
  fallbackLocale: "en",
  messages: { en, de },
});

// The admin page is a document of its own, so its `lang` follows the admin language.
watch(
  locale,
  (code) => {
    i18n.global.locale.value = code;
    document.documentElement.lang = code;
  },
  { immediate: true },
);

/** The language of the admin UI, kept in `localStorage`. It is independent of the content locales. */
export function useAdminLocale() {
  return { locale, locales: ADMIN_LOCALES };
}

/** A host's {@link Text} in the admin language. Reactive inside templates and computeds. */
export const text = (value: Text | undefined) => translate(value, i18n.global.locale.value);
