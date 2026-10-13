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

type Dialog =
  | { kind: "copy"; from: string; to: string; exists: boolean }
  | { kind: "remove"; locale: string }
  | { kind: "discard"; shared: boolean; locales: string[] };

const english = (code: string) => localeLabel(code, "en");

/** The wording of the confirm dialog of a locale action. Language names are in English. */
export function localeDialog(dialog: Dialog) {
  if (dialog.kind === "copy") {
    const from = english(dialog.from);
    const to = english(dialog.to);
    return dialog.exists
      ? {
          title: `Overwrite ${to}?`,
          description: `Its draft will be replaced with the ${from} content.`,
          action: "Overwrite",
          destructive: true,
        }
      : {
          title: `Create ${to} from ${from}?`,
          description: `The ${from} content is saved as a draft.`,
          action: "Create",
          destructive: false,
        };
  }
  if (dialog.kind === "remove")
    return {
      title: `Remove the ${english(dialog.locale)} translation?`,
      description: "Its content is deleted, published or not. The other languages stay.",
      action: "Remove",
      destructive: true,
    };

  const names = new Intl.ListFormat("en", { type: "conjunction" }).format(
    dialog.locales.map(english),
  );
  const drafts = `the ${names} draft${dialog.locales.length > 1 ? "s" : ""}`;
  const subject = dialog.shared
    ? `Shared fields${dialog.locales.length ? ` and ${drafts}` : ""}`
    : drafts.replace(/^t/, "T");
  const plural = dialog.shared || dialog.locales.length > 1;
  return {
    title: "Discard all changes?",
    description: `${subject} ${plural ? "go" : "goes"} back to the published version.`,
    action: "Discard",
    destructive: true,
  };
}
