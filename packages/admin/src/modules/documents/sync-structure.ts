import type { Field, Fields } from "@/shared/api";
import { localeLabel } from "@/shared/locale";
import { itemFields } from "../../../../core/src/schema/traversal/item-fields";
import type { StructureCounts } from "../../../../core/src/content/writes/sync-structure";

const isList = (f: Field) => f.type === "array" || f.type === "blocks";

/** The structure state of a document with lists: shared now, following its entry, and the entry's default. */
export type StructureMenu = { synced: boolean; followsDefault: boolean; defaultOn: boolean };

/** Whether an entry has a localized top-level group, array or blocks field, so its structure MAY be shared. */
export const hasStructure = (entry: { localized?: boolean; fields: Fields }) =>
  !!entry.localized &&
  Object.values(entry.fields).some((f) => f.localized !== false && holdsList(f));

const holdsList = (f: Field): boolean =>
  isList(f) || (f.type === "group" && Object.values(f.fields).some(holdsList));

type I18n = {
  t: (key: string, values?: object | number, plural?: number) => string;
  locale: { value: string };
};

const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

// Whether an item has no value of its own outside its nested lists.
function untranslated(fields: Fields, item: Record<string, any>): boolean {
  const own = Object.entries(fields).filter(([, f]) => !isList(f) && f.type !== "join");
  if (!own.length) return false;
  return own.every(([key, f]) =>
    f.type === "group" && item[key] ? untranslated(f.fields, item[key]) : isEmpty(item[key]),
  );
}

/**
 * The ids of the items in `doc` that have no value of their own, at any depth. Read without fallback, they are the
 * items of a shared structure that the language has not translated yet.
 */
export function untranslatedIds(fields: Fields, doc: Record<string, any>, out = new Set<string>()) {
  for (const [key, f] of Object.entries(fields)) {
    const value = doc?.[key];
    if (f.type === "group" && value) untranslatedIds(f.fields, value, out);
    if (!isList(f) || !Array.isArray(value)) continue;
    for (const item of value) {
      const inner = itemFields(f, item);
      if (!inner) continue;
      if (untranslated(inner, item)) out.add(item.id);
      untranslatedIds(inner, item, out);
    }
  }
  return out;
}

/** One sentence per language whose items change, leaving out `skip`. */
export function structureChanges(
  counts: StructureCounts,
  skip: string | undefined,
  { t, locale }: I18n,
) {
  return Object.entries(counts)
    .filter(([l, c]) => l !== skip && (c.removed || c.added))
    .map(([l, c]) =>
      t("structure.changes", {
        locale: localeLabel(l, locale.value),
        removed: t("structure.removed", c.removed),
        added: t("structure.added", c.added),
      }),
    );
}

/** The confirmation of a switch to one structure from `from`, with the dry-run counts of the other languages. */
export function structureDialog(counts: StructureCounts, from: string, i18n: I18n) {
  const lines = structureChanges(counts, from, i18n);
  const used = i18n.t("structure.used", { locale: localeLabel(from, i18n.locale.value) });
  return {
    title: i18n.t("structure.confirmTitle"),
    description: `${lines.length ? lines.join(" ") : i18n.t("structure.noChanges")} ${used}`,
    action: i18n.t("structure.confirm"),
  };
}
