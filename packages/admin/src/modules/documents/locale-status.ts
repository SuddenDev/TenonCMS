import { localeLabel } from "@/shared/locale";

/** What a locale row holds: `undefined` for a locale without a row. */
export type LocaleRow = { publishedAt: string | null; hasDraft: boolean } | undefined;
export type LocaleState = "published" | "draft" | "missing";

/** A row is a draft with pending changes or without a publication, published otherwise. */
export function rowState(row: LocaleRow): LocaleState {
  if (!row) return "missing";
  return row.hasDraft || row.publishedAt === null ? "draft" : "published";
}

/**
 * The state of every locale and of the active one, and what "Discard all changes" would drop.
 * `sharedDraft`: the shared fields have a pending draft, which a publish in any locale publishes too. It makes the
 * active locale a draft, but never a missing one.
 * `discardAll.show`: something besides the active locale's own draft is pending.
 */
export function localeStatus({
  locales,
  active,
  rows,
  sharedDraft = false,
}: {
  locales: readonly string[];
  active: string;
  rows: Record<string, LocaleRow>;
  sharedDraft?: boolean;
}) {
  const states = locales.map((locale) => {
    const state = rowState(rows[locale]);
    return {
      locale,
      state: locale === active && sharedDraft && state === "published" ? ("draft" as const) : state,
    };
  });
  const pending = locales.filter((l) => rowState(rows[l]) === "draft");
  return {
    active: states.find((s) => s.locale === active)?.state ?? "missing",
    states,
    discardAll: {
      show: sharedDraft || pending.some((l) => l !== active),
      shared: sharedDraft,
      locales: pending,
    },
  };
}

/** What `localeDialog()` needs of a vue-i18n composer. */
type I18n = {
  t(key: string, named?: Record<string, unknown>, plural?: number): string;
  locale: { value: string };
};

type Dialog =
  | { kind: "copy"; from: string; to: string; exists: boolean }
  | { kind: "remove"; locale: string }
  | { kind: "discard"; shared: boolean; locales: string[] };

/** The wording of the confirm dialog of a locale action, in the admin language of `i18n`. */
export function localeDialog(dialog: Dialog, { t, locale }: I18n) {
  const name = (code: string) => localeLabel(code, locale.value);
  if (dialog.kind === "copy") {
    const from = name(dialog.from);
    const to = name(dialog.to);
    return dialog.exists
      ? {
          title: t("locales.overwriteTitle", { to }),
          description: t("locales.overwriteText", { from }),
          action: t("locales.overwrite"),
          destructive: true,
        }
      : {
          title: t("locales.createTitle", { to, from }),
          description: t("locales.createText", { from }),
          action: t("locales.create"),
          destructive: false,
        };
  }
  if (dialog.kind === "remove")
    return {
      title: t("locales.removeTitle", { locale: name(dialog.locale) }),
      description: t("locales.removeText"),
      action: t("locales.remove"),
      destructive: true,
    };

  const count = dialog.locales.length;
  const names = new Intl.ListFormat(locale.value, { type: "conjunction" }).format(
    dialog.locales.map(name),
  );
  return {
    title: t("locales.discardTitle"),
    description: !count
      ? t("locales.discardShared")
      : t(dialog.shared ? "locales.discardSharedAnd" : "locales.discardDrafts", { names }, count),
    action: t("locales.discard"),
    destructive: true,
  };
}
