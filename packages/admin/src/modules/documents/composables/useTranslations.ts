import { withLinkedDeletion } from "@/shared/linked-deletion";
import { computed, ref } from "vue";
import { client, schema } from "@/shared/api";
import { hasStructure, type StructureMenu } from "@/modules/documents/sync-structure";
import type { SyncChoice } from "../../../../../core/src/content/writes/sync-structure";
import { useLocale } from "@/shared/composables/useLocale";
import { usePerspective } from "@/shared/composables/usePerspective";
import { type LocaleRow, localeStatus, rowState } from "@/modules/documents/locale-status";

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

  /**
   * What a publish has something for: the languages with a draft, or for an entry without languages whether the
   * document has one. Empty while the languages load.
   */
  const publishable = computed((): string[] | boolean => {
    if (localized.value) return loaded.value ? status.value.publishable : [];
    const d = doc();
    return (
      !!d &&
      rowState({
        publishedAt: (d.publishedAt as string | null) ?? null,
        hasDraft: !!d.hasDraft,
      }) === "draft"
    );
  });

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
  // The default of the entry, from the `translations` setting, for documents that do not follow it yet.
  const setting = ref<Record<string, unknown>>({});
  const name = () => {
    const t = target();
    return t && ("global" in t ? t.global : t.collection);
  };
  /** The Structure submenu state, or `undefined` for an entry without lists or a document without a structure state. */
  const structure = computed((): StructureMenu | undefined => {
    const e = entry();
    const d = doc();
    if (
      !localized.value ||
      !e ||
      !hasStructure(e as never) ||
      typeof d?.syncStructure !== "boolean"
    )
      return undefined;
    const followsDefault = d.syncStructureDefault === true;
    const stored = setting.value[name() ?? ""];
    const fallback =
      typeof stored === "boolean"
        ? stored
        : ((e as { syncStructure?: boolean }).syncStructure ?? true);
    return {
      synced: d.syncStructure,
      followsDefault,
      defaultOn: followsDefault ? d.syncStructure : fallback,
    };
  });
  if (schema.value.globals?.translations)
    client.getGlobal("translations", { populate: false }).then(
      (g) => (setting.value = g as Record<string, unknown>),
      () => {},
    );

  /** Switches the structure from the active language. With `dryRun`, returns the counts per language. */
  const setStructure = (sync: SyncChoice, dryRun = false) => {
    const t = target()!;
    const options = { locale: active.value, dryRun } as never;
    return "global" in t
      ? client.setGlobalSyncStructure(t.global, sync, options)
      : client.setSyncStructure(t.collection, t.id, sync, options);
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
    publishable,
    defaults,
    loaded,
    copy,
    remove,
    discardAll,
    structure,
    setStructure,
  };
}
