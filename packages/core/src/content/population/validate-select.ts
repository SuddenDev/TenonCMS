import { type Collection, type Fields } from "../../schema/index.ts";
import { isObject } from "../../schema/condition.ts";
import { innerFields } from "../../schema/traversal/inner-fields.ts";
import { type PopulatePlan, step } from "./populate-plan.ts";
import { type SelectSpec } from "./select-fields.ts";

type Collections = Record<string, Collection>;

const META = ["id", "createdAt", "updatedAt", "createdBy", "updatedBy", "publishedAt", "hasDraft"];
const LOCALE_META = [
  "locale",
  "locales",
  "sharedDraft",
  "syncStructure",
  "syncStructureDefault",
  "alternates",
];

/**
 * The meta keys a document of a collection has. A localized collection adds the locale keys.
 * @returns The keys that `select` MAY name next to the fields.
 */
export const metaKeys = (localized?: boolean): readonly string[] =>
  localized ? [...META, ...LOCALE_META] : META;

/**
 * The meta keys of a global: none, except the locale keys on a localized one.
 * @returns The keys that `select` MAY name next to the fields, or `false` for none.
 */
export const globalMetaKeys = (localized?: boolean): readonly string[] | false =>
  localized ? ["locale", "locales", "sharedDraft", "syncStructure", "syncStructureDefault"] : false;

/**
 * Checks `select` against `fields` and the populate `plan`, with the same resolution rules as `populate()`.
 * `meta`: the meta keys of this level, `false` when it has none, as groups and globals.
 *
 * @returns The first path that does not fit, or `undefined`.
 */
export function badSelectPath(
  collections: Collections,
  fields: Fields,
  select: SelectSpec,
  plan: PopulatePlan | true,
  prefix = "",
  meta: readonly string[] | false = META,
): string | undefined {
  for (const [key, s] of Object.entries(select)) {
    const path = prefix + key;

    if (meta && s === true && meta.includes(key)) continue;
    if (!Object.hasOwn(fields, key) || (s !== true && !isObject(s))) return path;
    if (s === true) continue;

    const f = fields[key];
    const inner = innerFields(collections, f);
    const { on, child } = step(plan, key, f);
    if (!inner || !on) return path;

    const nested =
      f.type === "relation" || f.type === "join"
        ? metaKeys(collections[f.collection].localized)
        : false;
    const error = badSelectPath(collections, inner, s, child, `${path}.`, nested);
    if (error) return error;
  }
}
