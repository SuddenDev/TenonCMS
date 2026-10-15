import { useStorage } from "@vueuse/core";
import { computed, onScopeDispose, watch } from "vue";
import { useRoute } from "vue-router";
import { schema } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import { queryLocale } from "@/shared/locale";

// A throwing or missing storage only means the choice is not remembered.
const stored = useStorage("integral-locale", "", undefined, { onError: () => {} });

// Open forms. Each saves its pending edit and answers whether none is left.
const flushers = new Set<() => Promise<boolean>>();

/** Registers a form's flush for the lifetime of the calling scope. `select()` runs it before a switch. */
export function onLocaleFlush(flush: () => Promise<boolean>) {
  flushers.add(flush);
  onScopeDispose(() => flushers.delete(flush));
}

/**
 * The language the admin edits and lists in. It is kept in `localStorage`, and nothing reloads: views watch `locale`.
 * Without `localization` in the schema, `locales` is empty and `locale` is `undefined`.
 */
export function useLocale() {
  const locales = computed(() => schema.value.localization?.locales ?? []);
  const defaultLocale = computed(() => schema.value.localization?.defaultLocale);
  const locale = computed<string | undefined>({
    get: () => (locales.value.includes(stored.value) ? stored.value : defaultLocale.value),
    set: (code) => (stored.value = code ?? ""),
  });

  /** Saves the pending edits of every open form. `false`: an edit is left. */
  async function flush() {
    return (await Promise.all([...flushers].map((f) => f()))).every(Boolean);
  }

  /** Saves pending edits, then switches. A failed save asks first. */
  async function select(code: string) {
    if (!(await flush()) && !confirm(i18n.global.t("locales.unsaved"))) return;
    locale.value = code;
  }

  return { locales, defaultLocale, locale, select, flush };
}

/** Applies `?locale=` of the admin URL when it is a configured locale. Call it once, in the layout. */
export function useLocaleFromRoute() {
  const route = useRoute();
  const { locales, locale } = useLocale();
  watch(
    [() => route.query.locale, locales],
    ([value]) => {
      const code = queryLocale(value, locales.value);
      if (code) locale.value = code;
    },
    { immediate: true },
  );
}
