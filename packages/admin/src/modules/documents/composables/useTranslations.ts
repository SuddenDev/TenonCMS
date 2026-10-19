import { withLinkedDeletion } from "@/shared/linked-deletion";
import { computed, ref } from "vue";
import { client } from "@/shared/api";
import { useLocale } from "@/shared/composables/useLocale";
import { usePerspective } from "@/shared/composables/usePerspective";
import { type LocaleRow, localeStatus } from "@/modules/documents/locale-status";

type Doc = Record<string, unknown>;
export type TranslationTarget = { collection: string; id: string } | { global: string };

/**
 * The languages of a localized document or global: read and write options for the active language, the state of
 * every language, the default language's data for placeholders and the locale actions.
 * `doc` is the active language's latest document. `target` is `null` until a new document is saved.
 * Without a localized entry everything is empty and the options add nothing.
 */
export function useTranslations(
  entry: () => { localized?: boolean } | undefined,
  target: () => TranslationTarget | null,
  doc: () => Doc | null,
) {
  const { locales, defaultLocale, locale } = useLocale();
  const localized = computed(() => !!entry()?.localized && locales.value.length > 0);
  const active = computed(() => (localized.value ? locale.value : undefined));
  // The Published view shows what the site shows, so it keeps the fallback.
  const fallback = usePerspective().perspective === "drafts" ? false : undefined;

  /** Options of a read of the active language. */
  const read = () => (active.value ? { locale: active.value, fallback } : {});
  /** Options of a write in the active language. */
  const write = () => (active.value ? { locale: active.value } : {});

  // The languages with a row, and the last read of every language. `existing` is `null` while unknown.
  const existing = ref<string[] | null>(null);
  const loaded = ref(false);
  const reads = ref<Record<string, Doc | undefined>>({});

  async function refresh() {
    const t = target();
    if (!localized.value || !t) {
      existing.value = null;
      reads.value = {};
      return;
    }

    const docs = await Promise.all(
      locales.value.map((l) =>
        ("global" in t
          ? client.getGlobal(t.global, { locale: l, fallback, populate: false })
          : client.findById(t.collection, t.id, { locale: l, fallback, populate: false })
        ).catch(() => undefined),
      ),
    );

    loaded.value = true;
    existing.value = docs.find((d) => Array.isArray(d?.locales))?.locales ?? null;
    reads.value = Object.fromEntries(locales.value.map((l, i) => [l, docs[i] as Doc | undefined]));
  }

  function row(l: string): LocaleRow {
    if (existing.value && !existing.value.includes(l)) return undefined;

    const d = l === active.value ? doc() : reads.value[l];

    return d
      ? { publishedAt: (d.publishedAt as string | null) ?? null, hasDraft: !!d.hasDraft }
      : undefined;
  }

  const status = computed(() =>
    localeStatus({
      locales: locales.value,
      active: active.value ?? "",
      rows: Object.fromEntries(locales.value.map((l) => [l, row(l)])),
      sharedDraft: doc()?.sharedDraft === true,
    }),
  );

  /** The default language's data, for placeholders. Not for the default language itself. */
  const defaults = computed(() =>
    active.value && active.value !== defaultLocale.value
      ? reads.value[defaultLocale.value!]
      : undefined,
  );

  const copy = (from: string, to: string) => {
    const t = target()!;
    return "global" in t
      ? client.copyGlobalLocale(t.global, { from, to })
      : client.copyLocale(t.collection, t.id, { from, to });
  };
  const remove = (l: string) => {
    const t = target()!;
    return "global" in t
      ? client.removeGlobalLocale(t.global, l)
      : client.removeLocale(t.collection, t.id, l);
  };
  /** Drops the shared draft and every language's draft. A document that was never published is deleted: `null`. */
  const discardAll = async () => {
    const t = target()!;
    return "global" in t
      ? client.discardGlobal(t.global, { all: true })
      : withLinkedDeletion((options) =>
          client.discard(t.collection, t.id, { all: true, ...options }),
        );
  };

  return {
    localized,
    active,
    locales,
    defaultLocale,
    read,
    write,
    refresh,
    status,
    defaults,
    loaded,
    copy,
    remove,
    discardAll,
  };
}
