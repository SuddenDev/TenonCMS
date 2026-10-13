import type { Core, Scope } from "../../cms/runtime/types.ts";
import type { Loc } from "../../db/queries/document-sql.ts";
import type { Fields } from "../../schema/index.ts";
import { localizedKeys } from "../../schema/traversal/localized-fields.ts";

/**
 * Describes how a read treats the locale rows of a collection or global, from the locale of the scope.
 * @returns The locale descriptor of the queries, or `undefined` for an entry that is not localized.
 */
export function locOf(
  core: Core,
  s: Scope,
  entry: { localized?: boolean; fields: Fields },
): Loc | undefined {
  const l = core.localization;
  if (!l || !entry.localized) return undefined;
  return {
    locale: s.locale ?? l.defaultLocale,
    defaultLocale: l.defaultLocale,
    fallback: s.fallback ?? l.fallback,
    keys: localizedKeys(entry),
    locales: l.locales,
  };
}
