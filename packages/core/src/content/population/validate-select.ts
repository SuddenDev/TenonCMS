import { type Collection, type Fields } from "../../schema/index.ts";
import { isObject } from "../../schema/condition.ts";
import { innerFields } from "../../schema/traversal/inner-fields.ts";
import { type PopulatePlan, step } from "./populate-plan.ts";
import { type SelectSpec } from "./select-fields.ts";

type Collections = Record<string, Collection>;

const META = ["id", "createdAt", "updatedAt", "publishedAt", "hasDraft"];

/**
 * Checks `select` against `fields` and the populate `plan`, with the same resolution rules as `populate()`.
 * `doc`: this level is a document, so it has meta keys. Groups and globals have none.
 *
 * @returns The first path that does not fit, or `undefined`.
 */
export function badSelectPath(
  collections: Collections,
  fields: Fields,
  select: SelectSpec,
  plan: PopulatePlan | true,
  prefix = "",
  doc = true,
): string | undefined {
  for (const [key, s] of Object.entries(select)) {
    const path = prefix + key;

    if (doc && s === true && META.includes(key)) continue;
    if (!Object.hasOwn(fields, key) || (s !== true && !isObject(s))) return path;
    if (s === true) continue;

    const f = fields[key];
    const inner = innerFields(collections, f);
    const { on, child } = step(plan, key, f);
    if (!inner || !on) return path;

    const error = badSelectPath(collections, inner, s, child, `${path}.`, f.type !== "group");
    if (error) return error;
  }
}
