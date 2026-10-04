import { type Collection, type Fields } from "../../schema/index.ts";
import { innerFields, mapValue } from "../../schema/walk.ts";
type Collections = Record<string, Collection>;

/** Keys a read returns. `true` keeps the value; an object lists keys inside a group or a resolved relation or join. */
export type SelectSpec = { [key: string]: true | SelectSpec };
/** `doc` with only the keys in `select`. `id` is kept at every document level (`meta`). Values that are not objects stay as they are. */
export function pick(
  collections: Collections,
  fields: Fields,
  doc: Record<string, any>,
  select: SelectSpec,
  meta = true,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, s] of Object.entries(meta ? { id: true as const, ...select } : select)) {
    if (!Object.hasOwn(doc, key)) continue;
    const f = Object.hasOwn(fields, key) ? fields[key] : undefined;
    const inner = f && s !== true && innerFields(collections, f);
    out[key] = inner
      ? mapValue(doc[key], (d) => pick(collections, inner, d, s as SelectSpec, f.type !== "group"))
      : doc[key];
  }
  return out;
}
