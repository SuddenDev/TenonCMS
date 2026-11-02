import type { Core, Scope } from "../../cms/runtime/types.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import type { Loc } from "../../db/queries/document-sql.ts";
import { loadGlobal } from "../../db/queries/globals/load-global.query.ts";
import { structureFields, localizedKeys } from "../../schema/traversal/localized-fields.ts";
import { type ContentTarget, target } from "../targets.ts";

/**
 * Describes how a read treats the locale rows of a collection or global, from the locale of the scope.
 * An entry with structure fields reads the `translations` global for its default sync state.
 * @returns The locale descriptor of the queries, or `undefined` for an entry that is not localized.
 */
export async function locOf(core: Core, s: Scope, name: ContentTarget): Promise<Loc | undefined> {
  const l = core.localization;
  const entry = target(core, name);
  if (!l || !entry.localized) return undefined;
  const structure = structureFields(entry);
  return {
    locale: s.locale ?? l.defaultLocale,
    defaultLocale: l.defaultLocale,
    fallback: s.fallback ?? l.fallback,
    keys: localizedKeys(entry),
    locales: l.locales,
    structure,
    syncDefault: Object.keys(structure).length ? await syncDefault(core, s, name) : false,
  };
}

/** Whether documents of an entry that follow it use one structure: the `translations` setting, else the code default. */
export async function syncDefault(core: Core, s: Scope, name: ContentTarget) {
  const code = target(core, name).syncStructure ?? true;
  if (!core.translations) return code;
  const stored = await loadGlobal(await databaseForScope(core, s), TRANSLATIONS);
  const value = stored?.[name.name];
  return typeof value === "boolean" ? value : code;
}

/** The name of the built-in global that holds the default sync state of each entry. */
export const TRANSLATIONS = "translations";
