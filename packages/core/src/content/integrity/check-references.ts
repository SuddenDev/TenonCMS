import { type Database } from "../../db/types.ts";
import { type Fields } from "../../schema/index.ts";
import { relationPaths } from "../../schema/traversal/relation-paths.ts";
import { holdersAt } from "../../schema/traversal/holders-at.ts";
import { targetOf } from "../../schema/traversal/reference-fields.ts";
import { loadByIds } from "../../db/queries/documents/load-by-ids.query.ts";
import { existingIds } from "../../db/queries/references/existing-ids.query.ts";
import { accepts } from "../../media/library/names.ts";
import { ValidationError } from "../../errors.ts";
import type { Kysely } from "kysely";

/**
 * Every id MUST exist in its target collection. One query per relation field, for every item that holds it.
 * Files of `image` and `file` fields MUST also fit the field's `accept` and `maxSize`; an `image` only takes `image/*`.
 *
 * @throws {ValidationError} At the positional path of the first value that fails, e.g. `links.1.page`.
 */
export async function checkRefs(
  db: Kysely<Database>,
  fields: Fields,
  data: Record<string, unknown>,
  self?: { collection: string; id: string },
) {
  for (const { path, field } of relationPaths(fields)) {
    const to = targetOf(field);
    const held = holdersAt(data, path).flatMap(({ parent, key, at }) => {
      const value = parent[key];
      const ids: string[] = value == null ? [] : field.many ? value : [value];
      return ids.length ? [{ at, ids }] : [];
    });
    const fail = (at: string, message: string): never => {
      throw new ValidationError({ [at]: message });
    };

    if (self && to === self.collection)
      for (const h of held)
        if (h.ids.includes(self.id)) fail(h.at, "A document cannot reference itself");
    if (!held.length) continue;
    const ids = [...new Set(held.flatMap((h) => h.ids))];

    if (field.type === "relation") {
      const found = new Set(await existingIds(db, to, ids));
      for (const h of held)
        if (!h.ids.every((id) => found.has(id))) fail(h.at, `Unknown id in "${to}"`);
      continue;
    }

    const files = new Map((await loadByIds(db, to, ids)).map((f) => [f.id, f]));
    for (const h of held)
      for (const id of h.ids) {
        const f = files.get(id);
        if (!f) fail(h.at, `Unknown id in "${to}"`);
        else if (field.type === "image" && !accepts(["image/*"], f.mimeType))
          fail(h.at, "Not an image");
        else if (!accepts(field.accept, f.mimeType))
          fail(h.at, `Type "${f.mimeType}" is not accepted`);
        else if (field.maxSize !== undefined && f.size > field.maxSize)
          fail(h.at, `Larger than ${field.maxSize} bytes`);
      }
  }
}
