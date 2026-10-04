import { type Collection, type Fields } from "../../schema/index.ts";
import { isObject } from "../../schema/condition.ts";
import { innerFields } from "../../schema/traversal/inner-fields.ts";
import { type Spec, step } from "./population-spec.ts";
import { type SelectSpec } from "./select-fields.ts";
type Collections = Record<string, Collection>;

const META = ["id", "createdAt", "updatedAt", "publishedAt", "hasDraft"];

/**
 * The first path in `select` that does not fit `fields` and the populate `spec`, or `undefined`. Same resolution rules as `populate()`.
 * `doc`: this level is a document, so `id`, `createdAt` and `updatedAt` exist. Groups and globals have none.
 */
export function badSelectPath(
  collections: Collections,
  fields: Fields,
  select: SelectSpec,
  spec: Spec | true,
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
    const { on, child } = step(spec, key, f);
    if (!inner || !on) return path;
    const error = badSelectPath(collections, inner, s, child, `${path}.`, f.type !== "group");
    if (error) return error;
  }
}
